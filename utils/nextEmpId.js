const Counter = require('../models/Counter');
const Employee = require('../models/Employee');

const COUNTER_ID = 'employee_empId';

/**
 * Read the next empId WITHOUT consuming it.
 * Used by the frontend to pre-fill the form.
 */
async function peekNextEmpId() {
  const counter = await Counter.findById(COUNTER_ID);
  const next = (counter?.seq ?? 0) + 1;
  return 'EMP-' + String(next).padStart(4, '0');
}

/**
 * Atomically consume the next empId.
 * Safe under concurrency — MongoDB guarantees no two callers get the same value.
 */
async function consumeNextEmpId() {
  const counter = await Counter.findByIdAndUpdate(
    COUNTER_ID,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return 'EMP-' + String(counter.seq).padStart(4, '0');
}

/**
 * One-time seed: scan existing employees and set the counter to max(existing).
 * Called once at server startup. Idempotent.
 */
async function seedCounterIfNeeded() {
  const existing = await Counter.findById(COUNTER_ID);
  if (existing) return;

  const employees = await Employee.find({ empId: /^EMP-\d+$/ }).select('empId');
  const max = employees.reduce((m, e) => {
    const n = parseInt(e.empId.replace('EMP-', ''), 10);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);

  await Counter.create({ _id: COUNTER_ID, seq: max });
  console.log(`✅ Seeded employee_empId counter at ${max} (next = EMP-${String(max + 1).padStart(4, '0')})`);
}

module.exports = { peekNextEmpId, consumeNextEmpId, seedCounterIfNeeded };