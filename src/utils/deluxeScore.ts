import { MaimaiNotesProps } from "@/utils/api/song/maimai.ts";

export function getTotalNotes(notes: MaimaiNotesProps) {
  if (notes.total) {
    return notes.total;
  }
  return (notes.left?.total || 0) + (notes.right?.total || 0);
}

export function getDeluxeScoreStars(deluxeScore: number, notes: MaimaiNotesProps) {
  const totalNotes = getTotalNotes(notes);
  const percentage = Math.floor((deluxeScore / (totalNotes * 3)) * 100);

  let count = 0;
  let rate: 1 | 2 | 3 = 1;

  if (percentage >= 97) {
    count = 5;
    rate = 3;
  } else if (percentage >= 95) {
    count = 4;
    rate = 2;
  } else if (percentage >= 93) {
    count = 3;
    rate = 2;
  } else if (percentage >= 90) {
    count = 2;
  } else if (percentage >= 85) {
    count = 1;
  }

  return { count, rate };
}
