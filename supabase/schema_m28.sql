-- M28: a visual's credit can be a person, with a link to them.
--
-- agency_name has always been who made it, and the page it came from was also
-- the way to them: an agency's case study is on the agency's own site. A
-- LinkedIn or X post isn't, so the person's profile needs its own place.
--
-- On the project, where a page's reading lands, and on each visual, which is
-- what the board and the lightbox read -- the same pair agency_name is.
--
-- Safe to run more than once. Run it before deploying the code that reads it.

alter table visual_project add column if not exists creator_url text;
alter table visual add column if not exists creator_url text;
