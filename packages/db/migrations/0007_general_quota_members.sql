-- The general quota exists while two or more active activities draw from it:
-- those without a current quota of their own. A general quota left with one
-- becomes that activity's own quota, with the same limits; with none, it
-- closes. Closed policies stay in the history. It only closes and inserts
-- policies, so the api already published keeps working. Running it again
-- changes nothing.
WITH generals AS (
	SELECT g.*, c.family_id
	FROM quota_policies g
	JOIN children c ON c.id = g.child_id
	WHERE g.activity_id IS NULL AND g.valid_to IS NULL
),
members AS (
	SELECT g.id AS general_id, a.id AS activity_id
	FROM generals g
	JOIN activities a ON a.family_id = g.family_id AND a.is_active
	WHERE NOT EXISTS (
		SELECT 1
		FROM quota_policies own
		WHERE own.child_id = g.child_id
			AND own.activity_id = a.id
			AND own.valid_to IS NULL
	)
),
short AS (
	SELECT g.id, count(m.activity_id) AS member_count
	FROM generals g
	LEFT JOIN members m ON m.general_id = g.id
	GROUP BY g.id
	HAVING count(m.activity_id) < 2
),
converted AS (
	INSERT INTO quota_policies (
		child_id,
		activity_id,
		daily_limit_minutes,
		weekly_limit_minutes,
		weekly_bonus_cap_minutes,
		carry_over_excess,
		warning_minutes,
		allowed_days,
		grace_minutes,
		valid_from,
		created_by_parent_id
	)
	SELECT
		g.child_id,
		m.activity_id,
		g.daily_limit_minutes,
		g.weekly_limit_minutes,
		g.weekly_bonus_cap_minutes,
		g.carry_over_excess,
		g.warning_minutes,
		g.allowed_days,
		g.grace_minutes,
		now(),
		g.created_by_parent_id
	FROM short s
	JOIN generals g ON g.id = s.id
	JOIN members m ON m.general_id = g.id
	WHERE s.member_count = 1
)
UPDATE quota_policies
SET valid_to = now()
WHERE id IN (SELECT id FROM short);
