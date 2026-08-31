const model = require("./activity_log.model");
exports.getAll = async (req, res) => {
  const page = await model.getPage({
    start: req.query.start,
    length: req.query.length,
    search: req.query.search,
  });
  res.json({
    draw: Number(req.query.draw) || 0,
    recordsTotal: page.total,
    recordsFiltered: page.filtered,
    data: page.rows,
  });
};
