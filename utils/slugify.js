const slugify = (text) => {
  if (!text) return "";

  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
};

module.exports = slugify;
