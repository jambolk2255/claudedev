-- The general ledger is append-only, like the stock ledger: corrections are reversing entries.
CREATE OR REPLACE FUNCTION journal_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% rows are immutable', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_entry_no_update BEFORE UPDATE ON "JournalEntry" FOR EACH ROW EXECUTE FUNCTION journal_immutable();
CREATE TRIGGER journal_line_no_update BEFORE UPDATE ON "JournalLine" FOR EACH ROW EXECUTE FUNCTION journal_immutable();

-- Every journal entry must balance. Checked at commit so lines can be inserted one by one.
CREATE OR REPLACE FUNCTION journal_entry_balanced() RETURNS trigger AS $$
DECLARE diff numeric;
BEGIN
  SELECT COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0) INTO diff FROM "JournalLine" WHERE "entryId" = NEW."entryId";
  IF diff <> 0 THEN
    RAISE EXCEPTION 'Journal entry % is not balanced (difference %)', NEW."entryId", diff;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER journal_line_balanced
  AFTER INSERT ON "JournalLine" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION journal_entry_balanced();
