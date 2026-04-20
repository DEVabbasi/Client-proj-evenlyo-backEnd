// chatbot/tools/getSubcategories.js
const Category    = require("../../models/Category");
const SubCategory = require("../../models/SubCategory");
const Listing     = require("../../models/Listing");

async function getSubcategories({ category_name }, context) {
  if (!category_name) return { error: "Please provide a category name." };

  const category = await Category.findOne({
    $or: [
      { "name.en": { $regex: category_name, $options: "i" } },
      { "name.nl": { $regex: category_name, $options: "i" } },
      { name:      { $regex: category_name, $options: "i" } },
    ],
  }).lean();

  if (!category) {
    return {
      found:   false,
      message: `Category "${category_name}" not found. Available: Entertainment & Attractions, Food & Drinks, Decoration & Styling, Locations & Party Tents, Staff & Services.`,
    };
  }

  const subCategories = await SubCategory.find({
    mainCategory: category._id,
    isActive:     true,
  }).sort({ sortOrder: 1 }).lean();

  if (!subCategories.length) {
    return {
      found:         true,
      categoryName:  category.name?.en || category.name,
      count:         0,
      subcategories: [],
    };
  }

  const counts = await Promise.all(
    subCategories.map((sc) =>
      Listing.countDocuments({ subCategory: sc._id, status: "active", isActive: true })
    )
  );

  const resolveName = (f) => f?.en || f?.nl || (typeof f === "string" ? f : "");

  return {
    found:        true,
    categoryName: resolveName(category.name),
    count:        subCategories.length,
    subcategories: subCategories.map((sc, i) => ({
      id:           sc._id,
      name:         resolveName(sc.name),
      description:  sc.description?.en || sc.description?.nl || null,
      listingCount: counts[i] || 0,
      evenlyoProtectAvailable: sc.isEvenlyoProtectEnabled || false,
    })),
  };
}

module.exports = { getSubcategories };