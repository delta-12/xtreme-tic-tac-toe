#!/usr/bin/env python3

import os
import signal
import asyncio
import json
import secrets
import websockets
from enum import Enum, auto
from random import randint
from uuid import uuid4
from cryptography.fernet import Fernet
from base64 import b64decode, b64encode
from time import time

# TODO check for correct types in messages (make a message validator)


class Error(Enum):
    GAME_NOT_FOUND = auto()
    INVALID_TYPE = auto()
    INVALID_GAME_ID = auto()
    INVALID_SAVED_GAME = auto()
    INVALID_MOVE = auto()


JOIN = {}
GAMES = {}

LINES = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],  # rows
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],  # cols
    [0, 4, 8],
    [2, 4, 6],  # diags
]

KEY = Fernet.generate_key()  # TODO replace with env key
FERNET = Fernet(KEY)


def check_winner(cells):
    for line in LINES:
        if (
            cells[line[0]] is not None
            and cells[line[0]] == cells[line[1]]
            and cells[line[0]] == cells[line[2]]
        ):
            return cells[line[0]]
    return None


def is_board_full(cells):
    for cell in cells:
        if cell is None:
            return False
    return True


# Send an error message
async def error(websocket, error):
    error_message = ""

    if error == Error.GAME_NOT_FOUND:
        error_message = "Game not found"
    elif error == Error.INVALID_TYPE:
        error_message = "Invalid message type"
    elif error == Error.INVALID_GAME_ID:
        error_message = "Invalid game ID"
    elif error == Error.INVALID_SAVED_GAME:
        error_message = "Invalid saved game"
    elif error == Error.INVALID_MOVE:
        error_message = "Invalid move"

    event = {"type": "error", "error": error_message}

    await websocket.send(json.dumps(event))


# Send game state to player
async def send_game_state(key):
    state = GAMES[JOIN[key]["game_id"]]["state"]
    state["timestamp"] = time()
    await JOIN[key]["websocket"].send(
        json.dumps(
            {
                "type": "state",
                "state": state,
                "encrypted_state": b64encode(
                    FERNET.encrypt(json.dumps(state).encode())
                ),
            }
        )
    )


# Send player info
async def send_player_info(key):
    game_id = JOIN[key]["game_id"]
    player = "X"

    if GAMES[game_id]["player_o"] == key:
        player = "O"

    await JOIN[key]["websocket"].send(
        json.dumps(
            {
                "type": "game_id",
                "game_id": game_id,
                "encrypted_game_id": b64encode(FERNET.encrypt(game_id.encode())),
            }
        )
    )
    await JOIN[key]["websocket"].send(
        json.dumps({"type": "player_assign", "player": player})
    )


async def send_player_status(key):
    game_id = JOIN[key]["game_id"]
    player_status = {
        "type": "player_status",
        "player_x": (
            "Connected" if GAMES[game_id]["player_x"] is not None else "Disconnected"
        ),
        "player_o": (
            "Connected" if GAMES[game_id]["player_o"] is not None else "Disconnected"
        ),
    }

    if GAMES[game_id]["player_x"] is not None:
        await JOIN[GAMES[game_id]["player_x"]]["websocket"].send(
            json.dumps(player_status)
        )
    if GAMES[game_id]["player_o"] is not None:
        await JOIN[GAMES[game_id]["player_o"]]["websocket"].send(
            json.dumps(player_status)
        )


# Handle connection
async def handle_connection(key):

    async for message in JOIN[key]["websocket"]:
        game = GAMES[JOIN[key]["game_id"]].copy()

        parsed_message = json.loads(message)
        current_player = game["state"]["current_player"]

        if "type" in parsed_message and parsed_message["type"] == "move":
            big_index = parsed_message["big_index"]
            small_index = parsed_message["small_index"]

            if current_player == "X" and game["player_x"] != key:
                await error(JOIN[key]["websocket"], Error.INVALID_MOVE)
            elif current_player == "O" and game["player_o"] != key:
                await error(JOIN[key]["websocket"], Error.INVALID_MOVE)
            elif (
                game["state"]["small_wins"][big_index] is not None
                or game["state"]["board"][big_index][small_index] is not None
            ):
                await error(JOIN[key]["websocket"], Error.INVALID_MOVE)
            elif (
                game["state"]["active_board"] is not None
                and game["state"]["active_board"] is not big_index
            ):
                await error(JOIN[key]["websocket"], Error.INVALID_MOVE)
            elif check_winner(game["state"]["small_wins"]):
                break
            else:
                new_board = []
                for i in range(len(game["state"]["board"])):
                    small_board = game["state"]["board"][i]
                    if i == big_index:
                        small_board[small_index] = current_player
                    new_board.append(small_board)
                game["state"]["board"] = new_board

                new_win = check_winner(new_board[big_index])
                if new_win is not None:
                    game["state"]["small_wins"][big_index] = new_win

                if current_player == "X":
                    game["state"]["current_player"] = "O"
                else:
                    game["state"]["current_player"] = "X"

                if game["state"]["small_wins"][
                    small_index
                ] is not None or is_board_full(game["state"]["board"][small_index]):
                    game["state"]["active_board"] = None
                else:
                    game["state"]["active_board"] = small_index

                if game["player_x"] is not None:
                    await send_game_state(game["player_x"])
                if game["player_o"] is not None:
                    await send_game_state(game["player_o"])
        else:
            await error(JOIN[key]["websocket"], Error.INVALID_TYPE)

        # TODO handle game end


async def remove_connecion(key):
    game_id = JOIN[key]["game_id"]

    if GAMES[game_id]["player_o"] == key:
        GAMES[game_id]["player_o"] = None
    else:
        GAMES[game_id]["player_x"] = None

    try:
        if GAMES[game_id]["player_x"] is None and GAMES[game_id]["player_o"] is None:
            del GAMES[game_id]
            print("Ended game", game_id)
        else:
            await send_player_status(key)
    except:
        pass

    del JOIN[key]
    print("Closed connection", key)


# Start handling connection from player, cleanup on close
async def start_connection(key):
    try:
        await send_player_info(key)
        await send_player_status(key)
        await send_game_state(key)
        await handle_connection(key)
    finally:
        await remove_connecion(key)


def add_connection(websocket):
    key = secrets.token_urlsafe(12)
    JOIN[key] = {
        "websocket": websocket,
        "game_id": None,
    }

    print("New connection", key)

    return key


async def handle_game_id(websocket, game_id):
    if game_id not in GAMES:
        await error(websocket, Error.GAME_NOT_FOUND)
    elif (
        GAMES[game_id]["player_x"] is not None
        and GAMES[game_id]["player_o"] is not None
    ):
        await error(websocket, Error.INVALID_GAME_ID)
    else:
        key = add_connection(websocket)
        player = "player_x"

        if GAMES[game_id]["player_o"] is None:
            player = "player_o"

        JOIN[key]["game_id"] = game_id
        GAMES[game_id][player] = key
        await start_connection(key)


async def handle_saved_game(websocket, saved_game):
    # TODO
    if not saved_game:
        await error(websocket, Error.INVALID_SAVED_GAME)
    else:
        key = add_connection(websocket)
        # TODO
        await start_connection(key)


async def handle_new_game(websocket):
    key = add_connection(websocket)
    game_id = str(uuid4())
    GAMES[game_id] = {
        "player_x": None,
        "player_o": None,
        "state": {
            "board": [],
            "current_player": "X",
            "active_board": None,
            "small_wins": [],
        },
    }
    print("Started game", game_id)
    for i in range(9):
        GAMES[game_id]["state"]["board"].append([])
        GAMES[game_id]["state"]["small_wins"].append(None)
        for _ in range(9):
            GAMES[game_id]["state"]["board"][i].append(None)
    if randint(0, 1) == 0:
        GAMES[game_id]["player_x"] = key
    else:
        GAMES[game_id]["player_o"] = key
    JOIN[key]["game_id"] = game_id
    await start_connection(key)


# Handle a connection initial connection
async def handler(websocket):
    message = await websocket.recv()
    parsed_message = json.loads(message)

    if "type" not in parsed_message or parsed_message["type"] != "connect":
        await error(websocket, Error.INVALID_TYPE)
    elif "game_id" in parsed_message and parsed_message["game_id"] is not None:
        await handle_game_id(websocket, parsed_message["game_id"])
    elif "saved_game" in parsed_message and parsed_message["saved_game"] is not None:
        await handle_saved_game(websocket, parsed_message["saved_game"])
    else:
        await handle_new_game(websocket)


async def main():
    # Set the stop condition when receiving SIGTERM.
    loop = asyncio.get_running_loop()
    stop = loop.create_future()
    loop.add_signal_handler(signal.SIGTERM, stop.set_result, None)

    port = int(os.environ.get("GAME_SERVER_PORT", "25566"))
    async with websockets.serve(handler, "0.0.0.0", port):
        await stop


if __name__ == "__main__":
    print("Server started!")
    asyncio.run(main())
    print("Server stopped!")
