export const getTrophyColor = (color: string) => {
  if (color == "Bronze") {
    return "orange";
  } else if (color == "Normal") {
    return "gray";
  } else if (color == "Gold") {
    return "yellow";
  }
  return "grape";
}

export const getDeluxeRatingGradient = (rating: number) => {
  if (rating < 1000) {
    return { from: "lightblue", to: "lightblue" }
  } else if (rating < 2000) {
    return { from: "blue", to: "blue" };
  } else if (rating < 4000) {
    return { from: "lime", to: "green" };
  } else if (rating < 7000) {
    return { from: "yellow", to: "orange" };
  } else if (rating < 10000) {
    return { from: "lightcoral", to: "red" };
  } else if (rating < 12000) {
    return { from: "mediumorchid", to: "purple" }
  } else if (rating < 13000) {
    return { from: "peru", to: "brown"};
  } else if (rating < 14000) {
    return { from: "lightblue", to: "blue" };
  } else if (rating < 14500) {
    return { from: "gold", to: "goldenrod" };
  } else if (rating < 15000) {
    return { from: "khaki", to: "goldenrod" };
  }
  return { from: "red", to: "green" };
}

export const difficultyColor = [
  [
    "rgb(129,217,85)",
    "rgb(248,183,9)",
    "rgb(249,126,138)",
    "rgb(192,69,227)",
    "rgb(233,233,233)",
  ],
  [
    "rgb(34,187,91)",
    "rgb(251,156,45)",
    "rgb(246,72,97)",
    "rgb(158,69,226)",
    "rgb(186,103,248)",
  ],
  [
    "rgb(14,117,54)",
    "rgb(213,117,12)",
    "rgb(188,38,52)",
    "rgb(111,24,173)",
    "rgb(192,69,227)",
  ]
]

export const getScoreSecondaryColor = (level_index: number) => {
  return difficultyColor[2][level_index]
}

export const getScoreCardBackgroundColor = (level_index: number) => {
  return difficultyColor[localStorage.getItem("theme") === "\"light\"" ? 1 : 0][level_index]
}
