-- `segments` describes the mechanism (a time range in a file); `renditions`
-- describes the thing (one performance of a shabad by a particular ragi).
--
-- The distinction is the product: a shabad is the scripture text and lives in
-- BaniDB, a track is a file on sgpc.net, and a rendition is what someone
-- actually listens to. "One shabad, every rendition of it" is the sentence the
-- whole archive exists to make true, and it cannot be said with "segment".

alter table segments rename to renditions;

-- Indexes and constraints follow the table, but their names would still read
-- `segments_*` in every future EXPLAIN and error message.
alter index segments_pkey rename to renditions_pkey;
alter index segments_track_idx rename to renditions_track_idx;
alter index segments_shabad_idx rename to renditions_shabad_idx;
alter index segments_published_idx rename to renditions_published_idx;
alter index segments_name_trgm rename to renditions_name_trgm;
alter index segments_popular_idx rename to renditions_popular_idx;
alter index segments_artist_idx rename to renditions_artist_idx;

alter type segment_status rename to rendition_status;

-- Permission names are user-visible in the admin matrix, so they move too.
alter type app_permission rename value 'segments.propose' to 'renditions.propose';
alter type app_permission rename value 'segments.publish' to 'renditions.publish';
alter type app_permission rename value 'segments.review'  to 'renditions.review';
alter type app_permission rename value 'segments.delete'  to 'renditions.delete';

alter table renditions rename constraint segment_ordered to rendition_ordered;
