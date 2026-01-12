const SaleItem = require('../../models/SaleItemPurchase');
const Item = require('../../models/Item');
const mongoose = require('mongoose');
const { createActivityLog } = require('../../utils/activityLogger');
const ServiceItemStockLog = require('../../models/ServiceItemStockLog');


const createSaleItemOrder = async (req, res) => {
    try {
        let trackId = Math.floor(10000000 + Math.random() * 90000000).toString();

        const { items, paymentIntentId } = req.body;

        if (!items || items.length === 0) {
            return res.status(400).send({ message: "Items required" });
        }

        // 🔹 1. Validate stock first
        const itemDocs = [];

        for (const item of items) {
            const product = await Item.findById(item.itemId);

            if (!product) {
                return res.status(404).send({ message: "Item not found" });
            }

            if (product.stockQuantity < item.quantity) {
                return res.status(400).send({
                    message: `Not enough stock for item: ${product.title?.en || product.title}`
                });
            }

            itemDocs.push({ product, orderQty: item.quantity });
        }

        // 🔹 2. Deduct stock + create stock logs
        for (const { product, orderQty } of itemDocs) {
            // Update stock
            await Item.updateOne(
                { _id: product._id },
                { $inc: { stockQuantity: -orderQty } }
            );

            // Create stock log
            await ServiceItemStockLog.create({
                item: product._id,
                type: "checkout",
                quantity: orderQty,
                note: `Stock reduced by ${orderQty} due to sale order`,
                createdBy: req.user?.id
            });
        }

        // 🔹 3. Create order
        const newOrder = await SaleItem.create({
            ...req.body,
            trackingId: trackId,
            customerId: req.user.id,
            paymentIntentId
        });

        await createActivityLog({
            heading: {
                en: "New Sale Order Placed",
                nl: "Nieuwe verkooporder geplaatst"
            },
            type: "sale_item_order_placed",
            description: {
                en: "New Sale Item Order has been placed",
                nl: "Nieuwe verkoopitembestelling is geplaatst"
            },
            vendorId: req.user.id,
            ActivityType: "sale"
        });

        res.status(200).send({
            message: "Order Created Successfully",
            order: newOrder
        });

    } catch (err) {
        res.status(500).send({ message: err.message });
    }
};



const getSaleItemHistory = async (req, res) => {
    try {
        const { id } = req.user
        const allData = await SaleItem.find({ customerId: id })
        res.status(200).send({
            message: "Orders fetched Successfully",
            order: allData,
        });
    } catch (err) {
        res.status(500).send({ message: err.message });
    }
}

const getSaleItemHistoryForVendor = async (req, res) => {
    try {
        const { id } = req.user;

        const allData = await SaleItem.find({ vendorId: id })
            .populate('vendorId', 'firstName lastName email phone image')
            .populate("customerId", 'firstName lastName email phone image') // select only needed fields
            .sort({ createdAt: -1 });

        res.status(200).send({
            message: "Orders fetched Successfully",
            order: allData,
        });
    } catch (err) {
        res.status(500).send({ message: err.message });
    }
};
const updateSaleItemOrderStatus = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status } = req.body;

        // Allowed statuses
        const allowedStatuses = [
            "Order Placed",
            "On the way",
            "Delivered"
        ];

        // Validate status
        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid status provided"
            });
        }

        // Find and update the order
        const updatedOrder = await SaleItem.findByIdAndUpdate(
            orderId,
            { status },
            { new: true }
        );

        if (!updatedOrder) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Order status updated successfully",
            order: updatedOrder
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

module.exports = {
    createSaleItemOrder,
    getSaleItemHistory,
    getSaleItemHistoryForVendor,
    updateSaleItemOrderStatus
}