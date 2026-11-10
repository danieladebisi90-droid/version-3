-- Scoridium: team onboarding. Run in Supabase SQL Editor after reviewing existing columns.
-- Existing fields used: teams(id,school_name,mascot,primary_color,secondary_color),
-- seasons(id,team_id,seasons), team_members(team_id,user_id,role).

ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS team_type text;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS division text;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS club_name text;

-- Constrain only the new team_type column, permitting historical NULL values.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='scoridium_team_type_check'
      AND conrelid='public.teams'::regclass
  ) THEN
    ALTER TABLE public.teams ADD CONSTRAINT scoridium_team_type_check
      CHECK (team_type IS NULL OR team_type IN ('school','club'));
  END IF;
END $$;

-- All writes happen in a single PostgreSQL transaction via this RPC.
CREATE OR REPLACE FUNCTION public.create_scoridium_team(
  p_team_type text,
  p_school_name text,
  p_mascot text,
  p_club_name text,
  p_division text,
  p_primary_color text,
  p_secondary_color text,
  p_season text
)
RETURNS TABLE (team_id uuid, season_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_team uuid;
  v_season uuid;
  v_primary text := upper(trim(p_primary_color));
  v_secondary text := upper(trim(p_secondary_color));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in to create a team.';
  END IF;

  IF p_team_type NOT IN ('school', 'club') OR p_team_type IS NULL THEN
    RAISE EXCEPTION 'Select School or Club.';
  END IF;
  IF length(trim(coalesce(p_division,''))) NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'Division or age group is required (max 60 characters).';
  END IF;
  IF p_team_type = 'school' AND (
    length(trim(coalesce(p_school_name,''))) NOT BETWEEN 2 AND 100 OR
    length(trim(coalesce(p_mascot,''))) NOT BETWEEN 2 AND 70
  ) THEN
    RAISE EXCEPTION 'School name and mascot are required.';
  END IF;
  IF p_team_type = 'club' AND
     length(trim(coalesce(p_club_name,''))) NOT BETWEEN 2 AND 100 THEN
    RAISE EXCEPTION 'Club/team name is required.';
  END IF;
  IF v_primary !~ '^#[0-9A-F]{6}$' OR v_secondary !~ '^#[0-9A-F]{6}$' THEN
    RAISE EXCEPTION 'Colours must be valid 6-digit hex values.';
  END IF;
  IF p_season !~ '^20[0-9]{2}-20[0-9]{2}$' OR
     substring(p_season from 6 for 4)::int <> substring(p_season from 1 for 4)::int + 1 THEN
    RAISE EXCEPTION 'Season must have the format YYYY-YYYY (consecutive years).';
  END IF;

  -- Legacy Scoridium uses school_name + mascot. For clubs, store the club
  -- display name in mascot so existing header layouts remain usable.
  INSERT INTO public.teams
    (school_name, mascot, primary_color, secondary_color,
     team_type, division, club_name)
  VALUES
    (CASE WHEN p_team_type='school' THEN trim(p_school_name) ELSE '' END,
     CASE WHEN p_team_type='school' THEN trim(p_mascot) ELSE trim(p_club_name) END,
     v_primary, v_secondary, p_team_type, trim(p_division),
     CASE WHEN p_team_type='club' THEN trim(p_club_name) ELSE NULL END)
  RETURNING id INTO v_team;

  INSERT INTO public.seasons (team_id, seasons)
  VALUES (v_team, p_season)
  RETURNING id INTO v_season;

  INSERT INTO public.team_members (team_id, user_id, role)
  VALUES (v_team, v_uid, 'head_coach');

  RETURN QUERY SELECT v_team, v_season;
END;
$$;

REVOKE ALL ON FUNCTION public.create_scoridium_team(
  text,text,text,text,text,text,text,text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_scoridium_team(
  text,text,text,text,text,text,text,text
) TO authenticated;
