-- The stock ledger is append-only: block edits at the database level so no code path
-- (or manual SQL session) can silently rewrite stock history.
CREATE OR REPLACE FUNCTION stock_movement_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'StockMovement rows are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER stock_movement_no_update
  BEFORE UPDATE ON "StockMovement"
  FOR EACH ROW EXECUTE FUNCTION stock_movement_immutable();
