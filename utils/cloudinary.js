const forcePng = (url) => {
  if (!url || typeof url !== "string") return url;
  if (!url.includes("res.cloudinary.com") || !url.includes("/image/upload/")) {
    return url;
  }
  if (url.includes("/image/upload/f_png/")) return url;
  return url.replace("/image/upload/", "/image/upload/f_png/");
};

const withPngSubCategoryIcon = (doc) => {
  if (!doc) return doc;
  const obj = doc.toObject ? doc.toObject() : { ...doc };
  if (obj.icon) obj.icon = forcePng(obj.icon);
  return obj;
};

module.exports = {
  forcePng,
  withPngSubCategoryIcon,
};
