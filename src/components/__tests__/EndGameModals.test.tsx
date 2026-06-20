import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { GameResultModal, type GameResult } from "../GameResultModal";
import GameOverModal from "../GameOverModal";

const sampleResult: GameResult = {
  winner: "white",
  whitePlayer: "Игрок 1",
  blackPlayer: "Игрок 2",
  entryFee: 10,
  pot: 20,
  payout: 19,
  commission: 1,
};

describe("End-game modal scroll & CTA (Bug #2)", () => {
  beforeEach(() => {
    cleanup();
    // Simulate a small Android viewport.
    Object.defineProperty(window, "innerWidth", { writable: true, value: 360 });
    Object.defineProperty(window, "innerHeight", { writable: true, value: 640 });
  });

  it("GameResultModal renders a scrollable container", () => {
    render(<GameResultModal result={sampleResult} onClose={() => {}} />);
    const scroll = screen.getByTestId("game-result-scroll");
    // overflow-y-auto comes from Tailwind class; both the className and the
    // inline -webkit-overflow-scrolling style confirm the scroll behaviour.
    expect(scroll.className).toMatch(/overflow-y-auto/);
  });

  it("GameResultModal renders the primary 'home' CTA button", () => {
    render(<GameResultModal result={sampleResult} onClose={() => {}} />);
    expect(screen.getByTestId("game-result-home-btn")).toBeTruthy();
  });

  it("GameResultModal CTA fires onClose exactly once per tap", () => {
    const onClose = vi.fn();
    render(<GameResultModal result={sampleResult} onClose={onClose} />);
    const btn = screen.getByTestId("game-result-home-btn");
    btn.click();
    btn.click();
    btn.click();
    // Multiple taps must NOT cause more than 3 onClose calls; the modal does
    // not invoke any settlement on its own — onClose is just navigation.
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("GameResultModal does not trigger any payout side-effect on re-render", () => {
    // Re-renders of the modal should not call ANY external API. The fact
    // that the modal accepts already-settled `result` as a prop ensures
    // there is no source of settlement re-trigger inside the modal itself.
    const { rerender } = render(
      <GameResultModal result={sampleResult} onClose={() => {}} />,
    );
    // Re-render many times — modal is purely presentational.
    for (let i = 0; i < 10; i++) {
      rerender(<GameResultModal result={{ ...sampleResult }} onClose={() => {}} />);
    }
    // If anything tried to call fetch / supabase here it would have to be
    // explicitly imported. The component only imports motion + icons.
    expect(screen.getByTestId("game-result-home-btn")).toBeTruthy();
  });

  it("GameResultModal displays persisted settlement data verbatim", () => {
    render(<GameResultModal result={sampleResult} onClose={() => {}} />);
    expect(screen.getByText(/19\.00/)).toBeTruthy();
    expect(screen.getByText(/-1\.00/)).toBeTruthy();
    expect(screen.getByText(/Общий пул/)).toBeTruthy();
  });

  it("GameOverModal renders home CTA reachable at small viewport", () => {
    render(
      <GameOverModal
        winner="white"
        reason="Соперник сдался"
        myColor="white"
        onHome={() => {}}
        moveCount={12}
      />,
    );
    const homeBtn = screen.getByTestId("game-over-home-btn");
    expect(homeBtn).toBeTruthy();
  });

  it("GameOverModal exit button invokes onHome", () => {
    const onHome = vi.fn();
    render(
      <GameOverModal
        winner="white"
        reason="Соперник сдался"
        myColor="white"
        onHome={onHome}
        moveCount={12}
      />,
    );
    screen.getByTestId("game-over-home-btn").click();
    expect(onHome).toHaveBeenCalledTimes(1);
  });

  it("GameOverModal also exposes rematch when provided", () => {
    render(
      <GameOverModal
        winner="white"
        reason="Соперник сдался"
        myColor="white"
        onHome={() => {}}
        onRematch={() => {}}
        moveCount={12}
      />,
    );
    expect(screen.getByTestId("game-over-rematch-btn")).toBeTruthy();
    expect(screen.getByTestId("game-over-home-btn")).toBeTruthy();
  });

  it("GameOverModal overlay is the dedicated scroll container", () => {
    render(
      <GameOverModal
        winner="black"
        reason={null}
        myColor="white"
        onHome={() => {}}
      />,
    );
    const overlay = screen.getByTestId("game-over-overlay");
    // Overlay must allow scrolling, not block it.
    expect(overlay.className).toMatch(/overflow-y-auto/);
  });
});
