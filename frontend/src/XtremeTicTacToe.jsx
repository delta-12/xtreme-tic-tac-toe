import { useState, useEffect, useRef } from "react";
import { Socket } from "./Socket";

const initialBoard = () => Array(9).fill(null).map(() => Array(9).fill(null));

export default function ExtremeTicTacToe() {
    const [board, setBoard] = useState(initialBoard());
    const [currentPlayer, setCurrentPlayer] = useState("X");
    const [activeBoard, setActiveBoard] = useState(null); // null = any board
    const [smallWins, setSmallWins] = useState(Array(9).fill(null)); // track mini board winners
    const [player, setPlayer] = useState(null);
    
    const socket = useRef(null);

    useEffect(() => {
        const queryParams = new URLSearchParams(window.location.search);

        socket.current = new Socket(
            "ws://localhost:10801/",
            () => {
                socket.current.sendMessage(JSON.stringify({
                    type: "connect",
                    game_id: queryParams.get("game_id")
                }));
            },
            message => {
                const parsed_message = JSON.parse(message);

                switch (parsed_message.type) {
                    case "error":
                        alert(parsed_message.error);
                        break;
                    case "state":
                        setBoard(parsed_message.state.board);
                        setCurrentPlayer(parsed_message.state.current_player);
                        setActiveBoard(parsed_message.state.active_board);
                        setSmallWins(parsed_message.state.small_wins);
                        break;
                    case "player":
                        setPlayer(parsed_message.player)
                        break;
                    default:
                        break;
                }
            },
            event => {
                socket.current = null;
            },
            error => { alert(error) }
        );

        return () => {
            if (socket.current) {
                socket.current.close();
            }
        }
    }, []);

    const handleClick = (bigIndex, smallIndex) => {
        if (smallWins[bigIndex] || board[bigIndex][smallIndex]) return;
        if (activeBoard !== null && activeBoard !== bigIndex) return;

        const newBoard = board.map((smallBoard, i) =>
            i === bigIndex
                ? smallBoard.map((cell, j) => (j === smallIndex ? currentPlayer : cell))
                : smallBoard
        );

        const newSmallWins = smallWins.slice();
        if (checkWinner(newBoard[bigIndex])) {
            newSmallWins[bigIndex] = currentPlayer;
        }

        setBoard(newBoard);
        setSmallWins(newSmallWins);
        setCurrentPlayer(currentPlayer === "X" ? "O" : "X");

        const nextActiveBoard = smallIndex;
        if (smallWins[nextActiveBoard] || isBoardFull(newBoard[nextActiveBoard])) {
            setActiveBoard(null); // Player can play anywhere
        } else {
            setActiveBoard(nextActiveBoard);
        }
    };

    const checkWinner = (cells) => {
        const lines = [
            [0, 1, 2],
            [3, 4, 5],
            [6, 7, 8], // rows
            [0, 3, 6],
            [1, 4, 7],
            [2, 5, 8], // cols
            [0, 4, 8],
            [2, 4, 6], // diags
        ];
        for (let [a, b, c] of lines) {
            if (cells[a] && cells[a] === cells[b] && cells[a] === cells[c]) {
                return cells[a];
            }
        }
        return null;
    };

    const isBoardFull = (cells) => {
        return cells.every(cell => cell !== null);
    };

    const overallWinner = checkWinner(smallWins);

    return (
        <div className="flex flex-col items-center p-4 space-y-4 min-h-screen">
            <h1 className="text-3xl font-bold mb-4">Extreme Tic Tac Toe</h1>
            {overallWinner ? (
                <div className="text-2xl font-bold text-green-500">
                    {overallWinner} wins the game!
                </div>
            ) : (
                <>
                    <div className="text-lg">Player: {player}</div>
                    <div className="text-lg">Current Player: {currentPlayer}</div>
                </>
            )}
            <div className="grid grid-cols-3 gap-3 sm:gap-4 max-w-4xl lg:w-2/5 sm:w-full p-2 sm:p-4">
                {board.map((smallBoard, bigIndex) => (
                    <div
                        key={bigIndex}
                        className={`gap-1 p-2 sm:gap-2 rounded-lg border-2 p-1 sm:p-2 aspect-square transition ${activeBoard === null || activeBoard === bigIndex
                            ? "border-blue-500"
                            : "border-gray-400 opacity-50"
                            } ${smallWins[bigIndex] ? "flex items-center bg-green-100" : "grid grid-cols-3"}`}
                    >
                        {smallWins[bigIndex] ? (
                            <div className="w-full h-full flex items-center justify-center text-6xl sm:text-8xl font-extrabold text-green-600 animate-pop">
                                {smallWins[bigIndex]}
                            </div>
                        ) : (
                            smallBoard.map((cell, smallIndex) => (
                                <button
                                    key={smallIndex}
                                    className="w-full h-full flex items-center justify-center border rounded-md text-base sm:text-xl font-bold hover:bg-gray-200 transition active:scale-95"
                                    onClick={() => handleClick(bigIndex, smallIndex)}
                                >
                                    <span className="block w-6 h-6 sm:w-8 sm:h-8 items-center">
                                        {cell}
                                    </span>
                                </button>
                            ))
                        )}
                    </div>
                ))}
            </div>

            {/* Small win animation */}
            <style>{`
                @keyframes pop {
                0% {
                    opacity: 0;
                    transform: scale(0.5);
                }
                60% {
                    opacity: 1;
                    transform: scale(1.1);
                }
                100% {
                    transform: scale(1);
                }
                }
                .animate-pop {
                animation: pop 0.5s ease-out forwards;
                }
            `}</style>

        </div>
    );
}
