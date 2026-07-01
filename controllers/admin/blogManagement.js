const asyncHandler = require('express-async-handler');
const Blog = require('../../models/Blog');
const User = require('../../models/User');
const { sendPromotionalEmail } = require('../../utils/mailer');
const { toMultilingualText } = require('../../utils/textUtils');
const sanitizeHtml = require('sanitize-html');


// @desc    Create new blog
// @route   POST /api/blogs
// @access  Private (Admin only)
const createBlog = asyncHandler(async (req, res) => {
  try {
    console.log('=== createBlog called ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));

    const {
      title,
      description,
      content,
      author,
      category,
      image,
      isMain = false,
      tags = [],
      metaTitle,
      metaDescription,
      keywords,
      slug
    } = req.body;

    // Validation
<<<<<<< HEAD
    if (!title || !description || !content || !author || !category  || !image) {
      console.log('❌ Validation failed. Missing fields:', {
        title: !!title,
        description: !!description,
        content: !!content,
        author: !!author,
        category: !!category,
        readTime: !!readTime,
        image: !!image
      });
=======
    if (!title || !description || !content || !author || !category || !image) {
>>>>>>> main
      return res.status(400).json({
        success: false,
        message: 'All required fields must be provided'
      });
    }

    console.log('✅ Basic validation passed');

    // If setting as main blog, unset other main blogs
    if (isMain) {
      console.log('isMain is true, unsetting other main blogs...');
      const unsetResult = await Blog.updateMany({ isMain: true }, { isMain: false });
      console.log('Unset result:', unsetResult);
    }

    // Sanitize HTML content
    const sanitizeContent = (content) => {
      if (typeof content === 'string') {
        return sanitizeHtml(content, {
          allowedTags: sanitizeHtml.defaults.allowedTags.concat(['h1', 'h2', 'u']),
          allowedAttributes: false
        });
      } else if (typeof content === 'object' && content !== null) {
        return {
          en: sanitizeHtml(content.en || '', {
            allowedTags: sanitizeHtml.defaults.allowedTags.concat(['h1', 'h2', 'u']),
            allowedAttributes: false
          }),
          nl: sanitizeHtml(content.nl || '', {
            allowedTags: sanitizeHtml.defaults.allowedTags.concat(['h1', 'h2', 'u']),
            allowedAttributes: false
          })
        };
      }
      return content;
    };

    console.log('Raw content received:', content, '| typeof:', typeof content);

    const multilingualContent = toMultilingualText(content);
    console.log('After toMultilingualText:', multilingualContent);

    const processedContent = sanitizeContent(multilingualContent);
    console.log('After sanitizeContent:', processedContent);

    const titleML = toMultilingualText(title);
    const descriptionML = toMultilingualText(description);
    console.log('Title (multilingual):', titleML);
    console.log('Description (multilingual):', descriptionML);

    const blogPayload = {
      title: titleML,
      description: descriptionML,
      content: processedContent,
      author,
      category,
      image,
      isMain,
      tags,
      metaTitle,
      metaDescription,
      keywords,
      slug
    };

    console.log('Final payload passed to Blog.create:', JSON.stringify(blogPayload, null, 2));

    const blog = await Blog.create(blogPayload);

    console.log('✅ Blog created successfully:', blog._id);

    res.status(201).json({
      success: true,
      message: 'Blog created successfully',
      data: blog
    });
  } catch (error) {
    console.error('❌ Error creating blog:', error.name, '-', error.message);

    // Mongoose validation errors hide the actual field-level reason
    // inside error.errors — log that out specifically.
    if (error.name === 'ValidationError') {
      console.error('Validation error details:');
      Object.keys(error.errors).forEach((field) => {
        console.error(`  Field "${field}":`, error.errors[field].message);
      });
    }

    // Duplicate key errors (e.g. unique slug) show up differently
    if (error.code === 11000) {
      console.error('Duplicate key error:', error.keyValue);
    }

    console.error('Full stack:', error.stack);

    res.status(500).json({
      success: false,
      message: 'Error creating blog',
      error: error.message
    });
  }
});

// @desc    Update blog
// @route   PUT /api/blogs/:id
// @access  Private (Admin only)
const updateBlog = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    const blog = await Blog.findById(id);
    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog not found'
      });
    }

    // Convert string fields to multilingual objects if needed
    if (updateData.title) {
      updateData.title = toMultilingualText(updateData.title);
    }
    if (updateData.description) {
      updateData.description = toMultilingualText(updateData.description);
    }
    if (updateData.content) {
      const processedContent = typeof updateData.content === 'string'
        ? sanitizeHtml(updateData.content, {
          allowedTags: sanitizeHtml.defaults.allowedTags.concat(['h1', 'h2', 'u']),
          allowedAttributes: false
        })
        : updateData.content;
      updateData.content = toMultilingualText(processedContent);
    }

    // If setting as main blog, unset other main blogs
    if (updateData.isMain && !blog.isMain) {
      await Blog.updateMany({ isMain: true }, { isMain: false });
    }

    const updatedBlog = await Blog.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Blog updated successfully',
      data: updatedBlog
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating blog',
      error: error.message
    });
  }
});

// @desc    Delete blog
// @route   DELETE /api/blogs/:id
// @access  Private (Admin only)
const deleteBlog = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    const blog = await Blog.findById(id);
    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog not found'
      });
    }

    await Blog.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Blog deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting blog',
      error: error.message
    });
  }


});

module.exports = {
  createBlog,
  updateBlog,
  deleteBlog
};