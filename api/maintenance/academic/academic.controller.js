const model = require("./academic.model");
exports.forEntity = (entity) => ({
  getAll: async (_req, res) => res.json(await model.getAll(entity)),
  create: async (req, res) => {
    const name = String(req.body.name || "").trim(),
      code = String(req.body.code || "")
        .trim()
        .toUpperCase(),
      parentId = Number(req.body.parentId) || null,
      isActive = req.body.isActive !== false;
    if (!name || !code || (model.config[entity].parent && !parentId))
      return res
        .status(400)
        .json({ message: "Name, code, and parent selection are required." });
    try {
      const result = await model.create(entity, {
        name,
        code,
        parentId,
        isActive,
      });
      res
        .status(201)
        .json({ id: result.insertId, name, code, parentId, isActive });
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY")
        return res.status(409).json({
          message: `That ${entity} code already exists under the selected parent.`,
        });
      if (error.code === "ER_NO_REFERENCED_ROW_2")
        return res
          .status(400)
          .json({ message: "The selected parent no longer exists." });
      throw error;
    }
  },
  update: async (req, res) => {
    const name = String(req.body.name || "").trim(),
      code = String(req.body.code || "")
        .trim()
        .toUpperCase(),
      parentId = Number(req.body.parentId) || null,
      isActive = req.body.isActive !== false;
    if (!name || !code || (model.config[entity].parent && !parentId))
      return res
        .status(400)
        .json({ message: "Name, code, and parent selection are required." });
    try {
      const result = await model.update(entity, req.params.id, {
        name,
        code,
        parentId,
        isActive,
      });
      if (!result.affectedRows)
        return res.status(404).json({ message: `${entity} not found.` });
      res.json({ id: Number(req.params.id), name, code, parentId, isActive });
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY")
        return res
          .status(409)
          .json({
            message: `That ${entity} code already exists under the selected parent.`,
          });
      throw error;
    }
  },
  remove: async (req, res) => {
    try {
      const result = await model.remove(entity, req.params.id);
      if (!result.affectedRows)
        return res.status(404).json({ message: `${entity} not found.` });
      res.status(204).end();
    } catch (error) {
      if (error.code === "ER_ROW_IS_REFERENCED_2")
        return res.status(409).json({
          message: `This ${entity} cannot be removed while it has connected records.`,
        });
      throw error;
    }
  },
});
