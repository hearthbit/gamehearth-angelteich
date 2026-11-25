import type { GameConnection } from "@gamehearth/sdk/client";
import type { Texts } from "./texts";
import { bookEntries, bookEntryLine, bookSummary, describeMove, describeTable, statusLine, type Snapshot } from "./view";
import type { Ids, Options, PondMove, PondState } from "../../src/index";

export function mountAccessibleControls(root: HTMLElement, connection: GameConnection<PondState, PondMove, Options, Ids>, t: Texts): void {
  const status = document.createElement("p");
  status.setAttribute("aria-live", "polite");
  const table = document.createElement("p");
  const moves = document.createElement("div");
  moves.setAttribute("role", "group");
  moves.setAttribute("aria-label", t.yourMoves);
  const book = document.createElement("ul");
  book.setAttribute("aria-label", t.book);
  root.append(status, table, moves, book);
  let busy = false;
  connection.onUpdate((update) => {
    const snapshot = update.snapshot as Snapshot;
    status.textContent = statusLine(t, snapshot, update.players, update.options);
    table.textContent = describeTable(t, snapshot, update.players, update.profile);
    moves.replaceChildren(
      ...snapshot.moves.map((move) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = describeMove(t, move);
        button.addEventListener("click", () => {
          if (busy) {
            return;
          }
          busy = true;
          void connection.move(move).finally(() => {
            busy = false;
          });
        });
        return button;
      }),
    );
    const heading = document.createElement("li");
    heading.textContent = t.bookHeading(bookSummary(t, update.profile));
    book.replaceChildren(
      heading,
      ...bookEntries(update.profile).map((entry) => {
        const item = document.createElement("li");
        item.textContent = `${entry.caught ? t.fish(entry.fish.id) : t.unknownFish}: ${bookEntryLine(t, entry)}`;
        return item;
      }),
    );
  });
}
