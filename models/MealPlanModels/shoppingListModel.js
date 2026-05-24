const mongoose = require("mongoose");

// Shopping = derived data + user overrides, rebuildable from source
// (client 2026-05-16). Aggregation key is itemId + unit (NOT display
// name, NOT cross-unit). One ShoppingList per customer.
const shoppingItemSchema = mongoose.Schema(
  {
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ingredient",
      required: true,
    },
    unit: { type: String, enum: ["g", "ml", "pieces"], required: true },
    quantity: { type: Number, default: 0 },
    // "plan" = derived from the synced week; "user" = manually added.
    source: { type: String, enum: ["plan", "user"], default: "plan" },
    isOptional: { type: Boolean, default: false },
    isSupplement: { type: Boolean, default: false },
    checked: { type: Boolean, default: false },
    // User edited the quantity → plan sync must not clobber it.
    userEdited: { type: Boolean, default: false },
    // User deleted a plan item → never silently re-add; prompt instead.
    removedByUser: { type: Boolean, default: false },
  },
  { _id: true }
);

const shoppingListSchema = mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CustomerDetails",
      required: true,
      unique: true,
      index: true,
    },
    items: [shoppingItemSchema],
    // Recipes the user explicitly added (via the per-card button) or that
    // were pulled in by the last week-sync. Used only for display — the
    // line-item aggregation lives in `items`.
    selectedRecipes: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Recipe" },
    ],
    lastSyncedWeekId: { type: String, default: null },
  },
  { timestamps: true }
);

exports.ShoppingList = mongoose.model("ShoppingList", shoppingListSchema);
