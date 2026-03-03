import { CronExpressionParser } from "cron-parser";

/**
 * Compute the next run time for a cron expression or interval.
 */
export function getNextRunAt(
  schedule_type: "cron" | "interval",
  expression: string,
  from?: Date
): Date {
  const now = from || new Date();

  if (schedule_type === "cron") {
    const interval = CronExpressionParser.parse(expression, { currentDate: now });
    return interval.next().toDate();
  }

  // interval: parse as seconds
  const seconds = parseInt(expression, 10);
  if (isNaN(seconds) || seconds <= 0) {
    throw new Error(`Invalid interval expression: ${expression}`);
  }
  return new Date(now.getTime() + seconds * 1000);
}
