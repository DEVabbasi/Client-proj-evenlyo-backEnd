const SubCategory = require('../../models/SubCategory');
const Category = require('../../models/Category');
const mongoose = require('mongoose');

// @desc    Get all subcategories
// @route   GET /api/subcategories
// @access  Public
const getSubCategories = async (req, res) => {
  try {
    const { page = 1, limit = 10, categoryId, isActive, search } = req.query;
    
    // Build query object
    const query = {};
    
    // Filter by main category if provided
    if (categoryId) {
      query.mainCategory = categoryId;
    }
    
    // Filter by active status if provided
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    // Search by name if provided
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }
    
    // Calculate pagination
    const skip = (page - 1) * limit;
    
    // Get subcategories with populated main category
    const subCategories = await SubCategory.find(query)
      .populate('mainCategory', 'name icon')
      .sort({ sortOrder: 1, name: 1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count for pagination
    const total = await SubCategory.countDocuments(query);
    
    res.json({
      success: true,
      data: subCategories,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching subcategories:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching subcategories',
      error: error.message
    });
  }
};

// @desc    Get single subcategory by ID
// @route   GET /api/subcategories/:id
// @access  Public
const getSubCategoryById = async (req, res) => {
  try {
    const subCategory = await SubCategory.findById(req.params.id)
      .populate('mainCategory', 'name icon description');
    
    if (!subCategory) {
      return res.status(404).json({
        success: false,
        message: 'Subcategory not found'
      });
    }
    
    res.json({
      success: true,
      data: subCategory
    });
  } catch (error) {
    console.error('Error fetching subcategory:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid subcategory ID'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error fetching subcategory',
      error: error.message
    });
  }
};

// @desc    Get subcategories by main category
// @route   GET /api/subcategories/category/:categoryId
// @access  Public
const getSubCategoriesByCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { isActive } = req.query;

    // Verify category exists
    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    // Build query object for only active subcategories
    const query = {
      mainCategory: new mongoose.Types.ObjectId(categoryId),
      isActive: true
    };

    // Fetch subcategories
    const subCategories = await SubCategory.find(query)
      .populate('mainCategory', 'name icon')
      .sort({ sortOrder: 1, name: 1 });

    res.json({
      success: true,
      data: subCategories,
      category
    });

  } catch (error) {
    console.error('Error fetching subcategories by category:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching subcategories by category',
      error: error.message
    });
  }
};

module.exports = {
  getSubCategories,
  getSubCategoryById,
  getSubCategoriesByCategory
}; 