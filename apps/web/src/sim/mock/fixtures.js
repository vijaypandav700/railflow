import { parseTime as t } from "../time";

const station = {
  name: "Vortexa Junction",
  gap: 5,
  platforms: ["P1", "P2", "P3", "P4"],
  dwellMin: 2,
  maxHold: 120,
  closureBuffer: 5,
};

// id, name, class, arr, dep, platform, required platform
const rows = [
  ["T101", "Vortexa Express", "express", "09:10", "09:25", "P1", null],
  ["T102", "City Local", "local", "09:20", "09:35", "P2", null],
  ["T103", "Ring Local", "local", "09:30", "09:45", "P1", null],
  ["T104", "Hill Local", "local", "09:40", "09:55", "P3", null],
  ["T105", "Coast Express", "express", "09:50", "10:05", "P1", null],
  ["T106", "Mill Local", "local", "10:00", "10:15", "P2", null],
  ["T107", "Capital Premium", "premium", "10:10", "10:25", "P1", null],
  ["T108", "Port Local", "local", "10:15", "10:30", "P3", null],
  ["T109", "Lake Local", "local", "10:20", "10:35", "P2", null],
  ["T110", "Night Express", "express", "10:30", "10:45", "P1", "P1"],
];

const trains = rows.map(([id, name, cls, arr, dep, , req]) => ({
  id,
  name,
  cls,
  arr: t(arr),
  dep: t(dep),
  requiredPlatform: req,
}));

const initialPlan = {
  entries: rows.map(([id, , , arr, dep, platform]) => ({
    trainId: id,
    platform,
    arr: t(arr),
    dep: t(dep),
  })),
  unscheduled: [],
};

export const s03 = {
  id: "S03-single-delay",
  station,
  trains,
  initialPlan,
  startClock: t("09:00"),
  endClock: t("11:00"),
};