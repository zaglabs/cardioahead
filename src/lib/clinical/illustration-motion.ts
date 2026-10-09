// Educational, slowed-down mechanisms; no patient measurements drive this motion.
// Valve sequence: https://www.nhlbi.nih.gov/health/heart/heart-beats
export function cardiacCycle(progress: number) {
  const p = ((progress % 1) + 1) % 1;
  // Cavity volume changes during filling/ejection, not while both valves close.
  const contraction =
    p < 0.4 ? 1 - p / 0.4 : p < 0.46 ? 0 : p < 0.68 ? (p - 0.46) / 0.22 : 1;
  return {
    phase:
      p < 0.4
        ? "filling"
        : p < 0.46
          ? "contraction"
          : p < 0.68
            ? "ejection"
            : "relaxation",
    contraction,
    mitralOpen: p < 0.4,
    aorticOpen: p >= 0.46 && p < 0.68,
  } as const;
}
export function lumenRadius(x: number, expansion: number) {
  return 42 - (29 - 22 * expansion) * Math.exp(-Math.pow((x - 310) / 65, 2));
}
// Travel time is weighted by lumen area: particles accelerate through the throat,
// rather than implying that local velocity falls where the lumen narrows.
// This is a qualitative illustration, not a blood-flow or pressure calculation.
export function arteryTravel(expansion: number) {
  const samples = 80;
  const weights = Array.from({ length: samples }, (_, i) =>
    Math.pow(lumenRadius(60 + ((i + 0.5) * 500) / samples, expansion), 2),
  );
  const total = weights.reduce((a, b) => a + b, 0);
  return (progress: number) => {
    let target = (((progress % 1) + 1) % 1) * total;
    for (let i = 0; i < samples; i++) {
      if (target <= weights[i])
        return 60 + ((i + target / weights[i]) * 500) / samples;
      target -= weights[i];
    }
    return 560;
  };
}
export function arteryPosition(progress: number, expansion: number) {
  return arteryTravel(expansion)(progress);
}
