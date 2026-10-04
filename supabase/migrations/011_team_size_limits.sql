-- Team size limits for two team events: competitions.max_team_size is how
-- many people one shakha/meghala/diocese team can have (the register form
-- disables the event once its team is full; unset falls back to
-- DEFAULT_MAX_TEAM_MEMBERS = 7). Matched by name, team events only.
-- Plain updates — idempotent, safe to re-run.

update competitions set max_team_size = 8
where name = 'പരിചമുട്ടുകളി' and type = 'group';

update competitions set max_team_size = 5
where name = 'ബൈബിൾ ദൃശ്യാവതരണം' and type = 'group';
