"use client";

import React from "react";

interface ChessPieceProps {
  type: "p" | "n" | "b" | "r" | "q" | "k";
  color: "w" | "b";
}

const PIECE_UNICODE: Record<string, string> = {
  wp: "♙",
  wn: "♘",
  wb: "♗",
  wr: "♖",
  wq: "♕",
  wk: "♔",
  bp: "♟",
  bn: "♞",
  bb: "♝",
  br: "♜",
  bq: "♛",
  bk: "♚",
};

export default function ChessPiece({ type, color }: ChessPieceProps) {
  const key = `${color}${type}`;
  const isWhite = color === "w";

  return (
    <span
      className={`select-none text-[2.4rem] sm:text-[2.8rem] leading-none transition-transform duration-100 ${
        isWhite
          ? "text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.85)]"
          : "text-[#1b1a18] drop-shadow-[0_1px_1px_rgba(255,255,255,0.25)]"
      }`}
      aria-label={`${color === "w" ? "White" : "Black"} ${type}`}
    >
      {PIECE_UNICODE[key]}
    </span>
  );
}
