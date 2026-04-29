-- ============================================================
-- Migration: Add last move tracking columns to games table
-- Run this in the Supabase SQL Editor
-- ============================================================

alter table games
  add column if not exists last_from_row integer,
  add column if not exists last_from_col integer,
  add column if not exists last_to_row   integer,
  add column if not exists last_to_col   integer;
