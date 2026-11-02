// The reel's sections in seconds, shared by the edit (shots.js) and the score
// (music.mjs) so the drop, the break and the logo hit land on the cuts they
// were written for. Every number is a whole number of beats at BPM.
export const BPM = 120;
export const INTRO = 4.0;
export const BODY = 30.0;
export const TAGLINE = 4.0;
export const LOGO = 3.5;
export const TOTAL = INTRO + BODY + TAGLINE + LOGO;
