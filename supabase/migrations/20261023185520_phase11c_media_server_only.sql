-- CONTRACT: apply only after Production serves the 11C server uploader and Products,
-- catalog and avatars have passed their smoke. Do not run during expansion/Preview.
-- Old tabs must refresh. A rollback to old client uploads needs the narrow policies
-- from the expansion restored first; never restore global authenticated writes.
drop policy if exists phase11c_legacy_insert on storage.objects;
drop policy if exists phase11c_legacy_avatar_delete on storage.objects;
revoke execute on function private.product_media_legacy_write(text) from authenticated;
