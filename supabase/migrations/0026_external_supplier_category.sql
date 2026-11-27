-- «Այլ մատակարար»-ի համար՝ ինչ է մատակարարում (օր.՝ «ածուխ», «մրգեր»)
alter table external_suppliers add column if not exists category text check (length(category) <= 100);
