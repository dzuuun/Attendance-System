const types = {
  college: "colleges",
  department: "departments",
  employee: "employees",
  employee_department: "employee departments",
  program: "programs",
  school: "schools",
  section: "sections",
  student: "students",
  alumni: "alumni",
};

exports.create = (req, res) => {
  const type = String(req.body.type || "")
    .trim()
    .toLowerCase();
  const label = types[type];
  const added = Math.max(0, Number(req.body.added) || 0);
  const updated = Math.max(0, Number(req.body.updated) || 0);
  if (!label)
    return res.status(400).json({ message: "Choose a valid import type." });
  req.activityAction = "BULK_IMPORTED";
  req.activityDescription = `Bulk imported ${label}: ${added} added and ${updated} updated.`;
  res.json({ type, added, updated });
};
