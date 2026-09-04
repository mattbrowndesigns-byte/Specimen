-- Components can now carry a mobile crop alongside the desktop one. Mobile
-- layouts differ from desktop, so the region can't be derived from the desktop
-- crop -- it's a separate rectangle drawn on the mobile screenshot, and either
-- side may be absent.

alter table component_capture add column if not exists mobile_full_url text;

alter table component add column if not exists mobile_image_url text;
alter table component add column if not exists mobile_source_image_url text;
alter table component add column if not exists mobile_crop_rect jsonb;
