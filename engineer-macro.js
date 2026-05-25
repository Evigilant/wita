// ============================================================
// WITA — ENGINEER PURCHASE MACRO
// Store in wita.wita-macros compendium as:
//   Name: "WITA Engineer Purchase"
//   Slug: witaEngineerPurchase
//
// Item Piles injects into scope: seller, buyer, item, quantity, userId
// Returns false to suppress Item Piles' default transaction.
// ============================================================

(async () => {
    if (!game.modules.get("wita")?.active) {
        ui.notifications.error("WITA module is not active.");
        return false;
    }
    try {
        return await game.wita.bastion.handleEngineerPurchase({ seller, buyer, item, quantity, userId });
    } catch (e) {
        console.error("WITA | Engineer purchase macro failed:", e);
        ui.notifications.error("WITA | Purchase failed — check console (F12) for details.");
        return false;
    }
})();
