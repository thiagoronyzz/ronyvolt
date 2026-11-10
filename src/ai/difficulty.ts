/** Preserve each driver's personality while making the difficulty slider meaningful. */
export function adjustBotSkill(skill: number, difficulty: number): number {
  const level = Math.max(1, Math.min(10, difficulty));
  return Math.max(1, Math.min(10, skill + (level - 6) * 0.75));
}
