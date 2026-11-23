// How far an import may run ahead of the person it is importing for.
//
// Websites and resources finish on their own. Components and visuals do not:
// each one ends at a step only the owner can take (drawing a crop, choosing
// images), and until they take it the work so far sits in the one free 1 GB
// Storage bucket. A component capture is two full-page screenshots; a visuals
// project holds every candidate image off the page, up to forty of them at
// full size. A hundred of either, all prepared overnight, is most of the
// bucket spent on things nobody has looked at yet.
//
// So the queues prepare a few ahead and then wait. The import page says which
// of the two is happening -- "being captured" or "waiting until you crop" --
// because those are different reasons for the same number not moving.
//
// Twelve captures is about the size of a sitting with the crop tool. Five
// projects, because one project is already a page of images to choose from.
export const CROP_AHEAD = 12;
export const PICK_AHEAD = 5;
