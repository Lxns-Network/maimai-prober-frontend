export const getTrophyColor = (color: string) => {
  color = color.toLowerCase();
  if (color == "bronze" || color == "copper") {
    return "#F06418";
  } else if (color == "normal") {
    return "#656A7E";
  } else if (color == "gold") {
    return "#FFAB09";
  } else if (color == "platina") {
    return "#D9D02F";
  } else if (color == "silver") {
    return "#09B8FF";
  }
  return "#8931B2";
}

export const getRatingGradient = (rating: number) => {
  if (rating < 4) {
    return { from: "green", to: "green" }
  } else if (rating < 7) {
    return { from: "orange", to: "orange" }
  } else if (rating < 10) {
    return { from: "red", to: "red" }
  } else if (rating < 12) {
    return { from: "violet", to: "violet" }
  } else if (rating < 13.25) {
    return { from: "brown", to: "orange" }
  } else if (rating < 14.5) {
    return { from: "gray", to: "silver" }
  } else if (rating < 15.25) {
    return { from: "orange", to: "gold" }
  } else if (rating < 16) {
    return { from: "gold", to: "yellow" }
  }
  return { from: "red", to: "green" };
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

export const maimaiDifficultyColor = [
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

export const chunithmDifficultyColor = [
  [
    "rgb(0,171,132)",
    "rgb(255,125,0)",
    "rgb(241,41,41)",
    "rgb(142,26,230)",
    "rgb(255,40,84)",
  ],
  [
    "rgb(0,166,129)",
    "rgb(244,121,0)",
    "rgb(233,40,40)",
    "rgb(137,26,222)",
    "rgb(101,101,104)",
  ],
  [
    "rgb(0,146,112)",
    "rgb(216,106,0)",
    "rgb(206,34,35)",
    "rgb(120,22,195)",
    "rgb(43,48,51)",
  ]
]

export const getScoreSecondaryColor = (game: string, level_index: number) => {
  if (game === "maimai") {
    return maimaiDifficultyColor[2][level_index]
  } else if (game === "chunithm") {
    return chunithmDifficultyColor[2][level_index]
  }
  return "black";
}

export const getScoreCardBackgroundColor = (game: string, level_index: number) => {
  if (game === "maimai") {
    return maimaiDifficultyColor[1][level_index]
  } else if (game === "chunithm") {
    return chunithmDifficultyColor[1][level_index]
  }
  return "black";
}