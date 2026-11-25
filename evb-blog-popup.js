/*
 * Retired 2026-11-23. Its three pop-ups ("We're Always Buying" on blog posts
 * and on the sneaker pages, "Sell Your Streetwear and Sneakers" in the store)
 * are panel pop-ups now (Website → Pop-ups, panel 0103), drawn by
 * evb-popups.js, so the owner edits them there.
 *
 * The file stays so a page or cached copy that still loads it gets an empty
 * script instead of a 404. The flag tells evb-popups.js that the old built-in
 * pop-up isn't running here, so the panel's copy can show.
 */
window.EVB_BLOG_POPUP_RETIRED = true;
