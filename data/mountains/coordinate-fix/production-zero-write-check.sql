-- T13 Phase 0 read-only production baseline check.
-- The fingerprint input is the ordered sequence:
-- column_name:data_type:is_nullable:column_default
select
  (select count(*) from public.mountains) as mountains_row_count,
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'mountains'
  ) as mountains_column_count,
  (
    select md5(
      string_agg(
        column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, ''),
        '|' order by ordinal_position
      )
    )
    from information_schema.columns
    where table_schema = 'public' and table_name = 'mountains'
  ) as mountains_schema_fingerprint;
