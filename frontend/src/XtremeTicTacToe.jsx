import { useState, useEffect, useRef } from "react";
import Confetti from 'react-confetti';
import { useWindowSize } from '@react-hook/window-size';
import { Socket } from "./Socket";

const baseLink = "http://xtt.surge.sh/?game_id=";

const initialBoard = () => Array(9).fill(null).map(() => Array(9).fill(null));

const WinnerModal = ({ isOpen, winnerName, onClose }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
                <h2 className="text-2xl font-bold mb-4 text-blue-500">Game Over!</h2>
                <div className={`text-2xl font-bold mb-6 ${winnerName === "X" ? "text-green-500" : "text-red-500"}`}>
                    🏆 {winnerName} wins the game 🏆
                </div>
                <button
                    onClick={onClose}
                    className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition"
                >
                    New Game
                </button>
            </div>
        </div>
    );
};

const ShareLink = ({ isOpen, link, onClose, copied, setCopied }) => {
    if (!isOpen) return null;

    if (window.isSecureContext && navigator.clipboard) {
        navigator.clipboard.writeText(link)
            .then(() => {
                setCopied(true);
            });
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
                <h2 className="text-2xl font-bold text-blue-500">Share Link</h2>
                <div className="text-gray-400">
                    {link}
                </div>
                {copied ?
                    <div className="text-green-300">
                        ✓ Copied
                    </div>
                    : null
                }
                <button
                    onClick={onClose}
                    className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition mt-3"
                >
                    Done
                </button>
            </div>
        </div>
    );
};

export default function ExtremeTicTacToe() {
    const [board, setBoard] = useState(initialBoard());
    const [currentPlayer, setCurrentPlayer] = useState("X");
    const [activeBoard, setActiveBoard] = useState(null); // null = any board
    const [smallWins, setSmallWins] = useState(Array(9).fill(null)); // track mini board winners
    const [player, setPlayer] = useState(null);
    const [gameID, setGameID] = useState(null);
    const [playerXStatus, setPlayerXStatus] = useState("Disconnected");
    const [playerOStatus, setPlayerOStatus] = useState("Disconnected");
    const [showConfetti, setShowConfetti] = useState(false);
    const [width, height] = useWindowSize();
    const [shareLink, setShareLink] = useState(false);
    const [copied, setCopied] = useState(false);

    const socket = useRef(null);

    useEffect(() => {
        const queryParams = new URLSearchParams(window.location.search);

        socket.current = new Socket(
            `ws://${import.meta.env.VITE_SERVER_HOST ? import.meta.env.VITE_SERVER_HOST : "localhost"}:25566/`,
            () => {
                let message = {
                    type: "connect",
                    game_id: queryParams.get("game_id"),
                    encrypted_game_id: localStorage.getItem("encrypted_game_id"),
                    encrypted_state: localStorage.getItem("encrypted_state")
                };
                socket.current.sendMessage(JSON.stringify(message));
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
                        localStorage.setItem("encrypted_state", parsed_message.encrypted_state);
                        break;
                    case "game_id":
                        setGameID(parsed_message.game_id);
                        localStorage.setItem("encrypted_game_id", parsed_message.encrypted_game_id);
                        break;
                    case "player_assign":
                        setPlayer(parsed_message.player);
                        break;
                    case "player_status":
                        setPlayerXStatus(parsed_message.player_x);
                        setPlayerOStatus(parsed_message.player_o);
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

    const newGame = () => {
        window.location.reload();
    };

    const handleClick = (bigIndex, smallIndex) => {
        if (smallWins[bigIndex] || board[bigIndex][smallIndex]) return;
        if (activeBoard !== null && activeBoard !== bigIndex) return;
        if (currentPlayer !== player) return;
        if (checkWinner(smallWins)) return;

        if (socket.current) {
            socket.current.sendMessage(JSON.stringify({
                type: "move",
                big_index: bigIndex,
                small_index: smallIndex
            }))
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

    const checkOverallWinner = () => {
        const winner = checkWinner(smallWins);

        if (winner && !showConfetti) {
            setShowConfetti(true);
            setCurrentPlayer(null);
        }

        return winner;
    };

    const overallWinner = checkOverallWinner();
    const opponent = player ? player === "X" ? "O" : "X" : "";

    return (
        <div className="flex flex-col items-center p-4 space-y-4 min-h-screen">
            <h1 className="text-3xl font-bold mb-4">Extreme Tic Tac Toe</h1>
            <WinnerModal
                isOpen={!!overallWinner}
                winnerName={overallWinner}
                onClose={newGame}
            />
            {showConfetti ? <Confetti width={width} height={height} /> : null}
            <div className="flex items-center">
                <div className="text-lg mx-1">Game ID: {gameID}</div>
                <button
                    onClick={() => { setShareLink(true) }}
                    className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition mx-1"
                >
                    Share Link
                </button>
            </div>
            <ShareLink
                isOpen={shareLink}
                link={baseLink + gameID}
                onClose={() => {
                    setShareLink(false);
                    setCopied(false);
                }}
                copied={copied}
                setCopied={setCopied}
            />
            {overallWinner ? null : (
                <>
                    <div className="text-lg">{currentPlayer ? currentPlayer === player ? "Your turn" : "Opponent's turn" : ""}</div>
                </>
            )}
            <div className="flex w-full lg:max-w-4xl lg:w-2/5 gap-5">
                <div className={`w-full rounded-lg border-2 p-1 sm:p-2 ${currentPlayer === player ? "" : "border-gray-400 opacity-50"}`}>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <h2 className="text-xl font-bold">You</h2>
                            {player ? player === "X" ? playerXStatus : playerOStatus : ""}
                        </div>
                        <div className={`w-full h-full flex items-center justify-center text-6xl sm:text-8xl font-extrabold ${player ? player === "X" ? "text-green-600" : "text-red-600" : ""}`}>
                            {player}
                        </div>
                    </div>
                </div>
                <div className={`w-full rounded-lg border-2 p-1 sm:p-2 ${currentPlayer === opponent ? "" : "border-gray-400 opacity-50"}`}>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <h2 className="text-xl font-bold">Opponent</h2>
                            {player ? player === "X" ? playerOStatus : playerXStatus : ""}
                        </div>
                        <div className={`w-full h-full flex items-center justify-center text-6xl sm:text-8xl font-extrabold ${player ? player === "X" ? "text-red-600" : "text-green-600" : ""}`}>
                            {opponent}
                        </div>
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-3 gap-3 sm:gap-4 max-w-4xl lg:w-2/5 sm:w-full p-2 sm:p-4">
                {board.map((smallBoard, bigIndex) => (
                    <div
                        key={bigIndex}
                        className={`gap-1 p-2 sm:gap-2 rounded-lg border-2 p-1 sm:p-2 aspect-square transition ${activeBoard === null || activeBoard === bigIndex
                            ? "border-blue-500"
                            : "border-gray-400 opacity-50"
                            } ${smallWins[bigIndex] ? "flex items-center" : "grid grid-cols-3"}
                            ${smallWins[bigIndex] ? smallWins[bigIndex] === "X" ? "bg-green-100" : "bg-red-100" : ""}`}
                    >
                        {smallWins[bigIndex] ? (
                            <div className={`w-full h-full flex items-center justify-center text-6xl sm:text-8xl font-extrabold animate-pop ${smallWins[bigIndex] ? smallWins[bigIndex] === "X" ? "text-green-600" : "text-red-600" : ""}`}>
                                {smallWins[bigIndex]}
                            </div>
                        ) : (
                            smallBoard.map((cell, smallIndex) => (
                                <button
                                    key={smallIndex}
                                    className="w-full h-full flex items-center justify-center border rounded-md text-base sm:text-xl font-bold hover:bg-gray-200 transition active:scale-95"
                                    onClick={() => handleClick(bigIndex, smallIndex)}
                                >
                                    <span className={`block w-6 h-6 sm:w-8 sm:h-8 items-center ${cell ? cell === "X" ? "text-green-600" : "text-red-600" : ""}`}>
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
