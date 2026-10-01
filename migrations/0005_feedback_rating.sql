-- Optional stars sent with recipe feedback; shown on recipe cards as an average.
ALTER TABLE feedback ADD COLUMN rating INTEGER CHECK (rating BETWEEN 1 AND 5);
