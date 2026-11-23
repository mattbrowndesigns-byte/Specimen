// Reading an MP4 or MOV's own structure, without decoding it. Both are the
// same container: nested boxes, each a size, a four-letter name and contents.
// No dependencies, because the browser runs this to refuse a file before
// uploading it and the server runs it to be sure.

const text = (b, at) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);

function* boxes(b, view, start, end) {
  let at = start;
  while (at + 8 <= end) {
    let size = view.getUint32(at);
    let head = 8;
    if (size === 1 && at + 16 <= end) {
      size = view.getUint32(at + 8) * 2 ** 32 + view.getUint32(at + 12);
      head = 16;
    } else if (size === 0) size = end - at;
    if (size < head || at + size > end) return;
    yield { type: text(b, at + 4), at, body: at + head, end: at + size };
    at += size;
  }
}

const find = (b, view, parent, type) => {
  for (const box of boxes(b, view, parent.body, parent.end)) if (box.type === type) return box;
  return null;
};
const dig = (b, view, parent, ...path) => path.reduce((box, type) => box && find(b, view, box, type), parent);

function readTracks(b, view, moov) {
  const tracks = [];
  for (const trak of boxes(b, view, moov.body, moov.end)) {
    if (trak.type !== "trak") continue;
    const mdia = find(b, view, trak, "mdia");
    const hdlr = mdia && find(b, view, mdia, "hdlr");
    const stbl = mdia && dig(b, view, mdia, "minf", "stbl");
    const stsd = stbl && find(b, view, stbl, "stsd");
    const codec = stsd && stsd.body + 16 <= stsd.end ? text(b, stsd.body + 12) : null;
    let profile = null;
    if (stsd && (codec === "avc1" || codec === "avc3")) {
      // A visual sample entry is 78 bytes of fixed fields, then its own boxes.
      const entry = stsd.body + 8;
      const entryEnd = Math.min(stsd.end, entry + view.getUint32(entry));
      for (const box of boxes(b, view, entry + 86, entryEnd)) if (box.type === "avcC") profile = b[box.body + 1];
    }
    tracks.push({ trak, stbl, codec, profile, handler: hdlr ? text(b, hdlr.body + 8) : null });
  }
  return tracks;
}

function open(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const top = [...boxes(b, view, 0, b.length)];
  const ftyp = top.find((box) => box.type === "ftyp");
  const moov = top.find((box) => box.type === "moov");
  const fragmented = top.some((box) => box.type === "moof");
  return { b, view, ftyp, moov, fragmented, tracks: moov ? readTracks(b, view, moov) : [] };
}

const CODEC_NAMES = {
  hvc1: "HEVC", hev1: "HEVC", dvh1: "HEVC", dvhe: "HEVC",
  av01: "AV1", vp08: "VP8", vp09: "VP9", mp4v: "MPEG-4 Part 2", jpeg: "Motion JPEG", mjpa: "Motion JPEG",
  apch: "ProRes", apcn: "ProRes", apcs: "ProRes", apco: "ProRes", ap4h: "ProRes", ap4x: "ProRes",
};

// Baseline, Main, Extended and High. The rest are 10-bit or 4:2:2 and 4:4:4,
// which are H.264 by name and play almost nowhere.
const PLAIN_H264 = new Set([66, 77, 88, 100]);

const EXPORT =
  "In QuickTime Player, use File > Export As > 1080p and choose the most compatible format (H.264), then upload that copy.";

// Why this file can't be kept, as the end of a sentence that starts with its
// name -- or null if it plays in every browser.
export function refusal(bytes) {
  let file;
  try {
    file = open(bytes);
  } catch {
    file = {};
  }
  if (!file.ftyp || !file.moov) return `couldn't be read as a video. ${EXPORT}`;
  const video = file.tracks.find((t) => t.handler === "vide");
  if (!video) return "has no picture in it, only sound.";
  if (video.codec !== "avc1" && video.codec !== "avc3") {
    const name = CODEC_NAMES[video.codec] || "a format";
    return `is saved as ${name}${CODEC_NAMES[video.codec] ? ", which" : " that"} Chrome and Firefox often can't play. ${EXPORT}`;
  }
  if (video.profile !== null && !PLAIN_H264.has(video.profile)) {
    return `is saved in a kind of H.264 (HDR or studio quality) that most browsers can't play. ${EXPORT}`;
  }
  // A live recorder's MP4 is written in pieces, with no table saying where the
  // sound is, so it couldn't be taken out -- and it always is.
  if (file.fragmented && file.tracks.length > 1) {
    return `is a fragmented MP4, the kind a live recorder writes. ${EXPORT}`;
  }
  return null;
}

// Where every sample of a track sits in the file, from its sample tables.
function* samples(b, view, stbl) {
  const stsz = stbl && find(b, view, stbl, "stsz");
  const stsc = stbl && find(b, view, stbl, "stsc");
  const stco = stbl && find(b, view, stbl, "stco");
  const co64 = stbl && find(b, view, stbl, "co64");
  const offsets = stco || co64;
  if (!stsz || !stsc || !offsets) return;

  const fixed = view.getUint32(stsz.body + 4);
  const count = view.getUint32(stsz.body + 8);
  const runs = view.getUint32(stsc.body + 4);
  const chunks = view.getUint32(offsets.body + 4);
  let sample = 0;
  let run = 0;
  for (let chunk = 0; chunk < chunks && sample < count; chunk++) {
    while (run + 1 < runs && view.getUint32(stsc.body + 8 + (run + 1) * 12) <= chunk + 1) run++;
    const inChunk = view.getUint32(stsc.body + 8 + run * 12 + 4);
    const at = offsets.body + 8 + chunk * (stco ? 4 : 8);
    const start = stco ? view.getUint32(at) : view.getUint32(at) * 2 ** 32 + view.getUint32(at + 4);
    let size = 0;
    for (let i = 0; i < inChunk && sample < count; i++, sample++) {
      size += fixed || view.getUint32(stsz.body + 12 + sample * 4);
    }
    yield [start, start + size];
  }
}

// Makes the copy that is kept, in place and without re-encoding anything: the
// picture, in a container every browser accepts, and nothing else.
//
// The sound goes. Clips play muted, and the file itself is at a public
// address, so a voice in the room has no business still being inside it --
// the audio's bytes are zeroed, not just unlisted. So is everything a phone or
// a Mac writes beside the picture: location, device, timecode. And a MOV says
// it is an MP4, which it is in every respect but its name once those are gone;
// Firefox is the browser that minds.
//
// Boxes become `free`, the container's own word for "ignore this", so nothing
// moves and no table of offsets has to be rewritten.
export function strip(bytes) {
  const { b, view, ftyp, moov, tracks } = open(bytes);
  const free = (box) => {
    b.fill(0, box.body, box.end);
    b.set([0x66, 0x72, 0x65, 0x65], box.at + 4);
  };
  const name = (at, word) => b.set([...word].map((c) => c.charCodeAt(0)), at);

  const kept = tracks.find((t) => t.handler === "vide");
  for (const track of tracks) {
    if (track === kept) continue;
    for (const [from, to] of samples(b, view, track.stbl)) b.fill(0, from, Math.min(to, b.length));
    free(track.trak);
  }
  for (const box of [...boxes(b, view, moov.body, moov.end)]) {
    if (box.type === "udta" || box.type === "meta") free(box);
  }
  for (const box of [...boxes(b, view, kept.trak.body, kept.trak.end)]) {
    if (box.type === "udta" || box.type === "meta" || box.type === "tref") free(box);
  }
  for (let at = ftyp.body; at + 4 <= ftyp.end; at += 4) if (text(b, at) === "qt  ") name(at, "mp42");
  return b;
}
