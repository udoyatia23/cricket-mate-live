
-- Validation trigger for profiles table
CREATE OR REPLACE FUNCTION public.validate_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF length(trim(COALESCE(NEW.name, ''))) = 0 THEN
    RAISE EXCEPTION 'Name cannot be empty';
  END IF;
  IF length(NEW.name) > 100 THEN
    RAISE EXCEPTION 'Name must be less than 100 characters';
  END IF;
  IF NEW.phone_number IS NOT NULL AND NEW.phone_number != '' THEN
    IF length(NEW.phone_number) > 20 THEN
      RAISE EXCEPTION 'Phone number must be less than 20 characters';
    END IF;
    IF NEW.phone_number !~ '^[0-9+\-\s()]*$' THEN
      RAISE EXCEPTION 'Phone number contains invalid characters';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_profile_trigger
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_profile();

-- Validation trigger for tournaments table
CREATE OR REPLACE FUNCTION public.validate_tournament()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF length(trim(COALESCE(NEW.name, ''))) = 0 THEN
    RAISE EXCEPTION 'Tournament name cannot be empty';
  END IF;
  IF length(NEW.name) > 200 THEN
    RAISE EXCEPTION 'Tournament name must be less than 200 characters';
  END IF;
  IF NEW.address IS NOT NULL AND length(NEW.address) > 500 THEN
    RAISE EXCEPTION 'Address must be less than 500 characters';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_tournament_trigger
  BEFORE INSERT OR UPDATE ON public.tournaments
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_tournament();
