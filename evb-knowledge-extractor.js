/**
 * EVB Knowledge Base Extractor
 * Parses FAQ pages and product pages to build comprehensive knowledge base
 * Run in browser console on each page or use with Node.js
 */

const KnowledgeExtractor = (() => {
  // Stop words to filter out from keywords
  const STOP_WORDS = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'is', 'are',
    'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'can', 'could', 'should', 'may', 'might', 'i', 'me', 'my', 'we', 'you', 'your', 'our',
    'they', 'them', 'it', 'its', 'this', 'that', 'with', 'from', 'by', 'as', 'if', 'when',
    'where', 'why', 'how', 'which', 'who', 'what', 'about', 'out', 'just', 'so', 'more'
  ]);

  // Synonym mapping for keyword expansion
  const SYNONYMS = {
    'appraisal': ['appraise', 'evaluate', 'evaluation', 'assessment', 'check', 'value'],
    'kicks': ['sneaker', 'shoe', 'sneakers', 'shoes', 'footwear'],
    'handbag': ['bag', 'purse', 'designer bag', 'leather bag', 'luxury bag'],
    'condition': ['wear', 'damage', 'damaged', 'broken', 'scratched', 'beat up', 'mint', 'pristine'],
    'vintage': ['used', 'pre-owned', 'preowned', 'retro', 'old', 'heritage'],
    'authentic': ['real', 'genuine', 'original', 'authentic', 'verification', 'verify'],
    'payment': ['pay', 'payout', 'cash', 'check', 'payment method'],
    'appointment': ['appointment', 'book', 'schedule', 'walk-in', 'walk in', 'hours'],
    'gold': ['gold', 'golden', '10k', '14k', '18k', '22k', '24k', 'karat', 'carat'],
    'diamond': ['diamond', 'diamonds', 'gem', 'gemstone', 'precious stone'],
    'jewelry': ['jewelry', 'jewellery', 'jewel', 'piece'],
    'watch': ['watch', 'watches', 'rolex', 'omega', 'tag heuer', 'luxury watch'],
    'designer': ['designer', 'luxury', 'brand', 'branded', 'high-end', 'prestige']
  };

  // Product type categories
  const PRODUCT_TYPES = {
    jewelry: ['jewelry', 'gold', 'silver', 'diamond', 'diamonds', 'gemstone', 'platinum', 'coins', 'jewelry', 'estate'],
    sneakers: ['sneaker', 'kicks', 'shoe', 'jordan', 'yeezy', 'nike', 'dunk', 'adidas', 'footwear'],
    designer: ['designer', 'handbag', 'bag', 'louis vuitton', 'chanel', 'hermès', 'gucci', 'dior', 'prada'],
    electronics: ['iphone', 'airpods', 'camera', 'ipad', 'ps5', 'electronics', 'gadget', 'tech'],
    accessories: ['accessories', 'leather', 'watch', 'tiffany', 'gucci', 'prada', 'belt', 'wallet'],
    streetwear: ['streetwear', 'vintage', 'hype', 'supreme', 'bape', 'vintage clothing', 'apparel']
  };

  // Extract text from HTML, removing tags but preserving structure
  function extractText(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
  }

  // Generate keywords from text
  function generateKeywords(text, category = '') {
    const words = text.toLowerCase()
      .replace(/[^\w\s'-]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 2 && !STOP_WORDS.has(word));

    const keywords = [];
    const seen = new Set();

    // Add unique words
    words.forEach(word => {
      if (!seen.has(word)) {
        keywords.push(word);
        seen.add(word);
      }
    });

    // Add category as keyword
    if (category) {
      const catWords = category.toLowerCase().split(/\s+/);
      catWords.forEach(word => {
        if (word.length > 2 && !seen.has(word)) {
          keywords.push(word);
          seen.add(word);
        }
      });
    }

    return keywords;
  }

  // Detect product type from query/text
  function detectProductTypes(text) {
    const lower = text.toLowerCase();
    const types = [];

    Object.entries(PRODUCT_TYPES).forEach(([type, keywords]) => {
      if (keywords.some(kw => lower.includes(kw))) {
        types.push(type);
      }
    });

    return types.length > 0 ? types : ['general'];
  }

  // Extract from dedicated FAQ pages (.faq2-section format)
  function extractFromFAQ2(pageSource, productType, pageName) {
    const entries = [];
    let entryId = 0;

    // Find all faq2-group-label and their corresponding items
    const groups = Array.from(document.querySelectorAll('.faq2-group-label'));

    groups.forEach((groupLabel) => {
      const category = groupLabel.textContent.trim();

      // Find the next faq2-panel after this label
      let panel = groupLabel.nextElementSibling;
      while (panel && !panel.classList.contains('faq2-panel')) {
        panel = panel.nextElementSibling;
      }

      if (!panel) return;

      // Extract all items in this panel
      const items = panel.querySelectorAll('.faq2-item');

      items.forEach((item) => {
        const questionEl = item.querySelector('.faq2-q-text');
        const answerEl = item.querySelector('.faq2-a-inner');

        if (questionEl && answerEl) {
          const question = questionEl.textContent.trim();
          const answer = answerEl.innerHTML;

          const keywords = generateKeywords(question + ' ' + extractText(answer), category);
          const detectedTypes = detectProductTypes(question + ' ' + category);

          entries.push({
            id: `q_${productType}_${entryId++}`,
            question: question,
            answer: answer,
            category: category,
            subcategory: category,
            productTypes: detectedTypes.length > 0 ? detectedTypes : [productType],
            keywords: keywords,
            relatedQuestions: [],
            source: pageName,
            context: `From ${pageName}, ${category} section`
          });
        }
      });
    });

    return entries;
  }

  // Extract from product pages (details/summary format)
  function extractFromProductPage(productType, pageName) {
    const entries = [];
    let entryId = 0;

    // Find all details elements that are FAQs
    const faqSections = document.querySelectorAll('[class*="faq"], details');

    faqSections.forEach((section) => {
      // Check if this is a details element
      if (section.tagName === 'DETAILS') {
        const summary = section.querySelector('summary');
        const content = section.querySelector('[class*="answer"]');

        if (summary && content) {
          const question = summary.textContent.trim();
          const answer = content.innerHTML;

          // Find category from parent section or cp-section-faq title
          let category = 'General';
          const parentSection = section.closest('[class*="section"]');
          if (parentSection) {
            const sectionTitle = parentSection.querySelector('h3, h4, .section-title');
            if (sectionTitle) {
              category = sectionTitle.textContent.trim();
            }
          }

          const keywords = generateKeywords(question + ' ' + extractText(answer), category);
          const detectedTypes = detectProductTypes(question + ' ' + category);

          entries.push({
            id: `q_${productType}_${entryId++}`,
            question: question,
            answer: answer,
            category: category,
            subcategory: category,
            productTypes: detectedTypes.length > 0 ? detectedTypes : [productType],
            keywords: keywords,
            relatedQuestions: [],
            source: pageName,
            context: `From ${pageName}, ${category} section`
          });
        }
      }
    });

    return entries;
  }

  // Build master knowledge base
  function buildMasterKB(allEntries) {
    // Remove duplicates by similarity
    const unique = [];
    const seen = new Set();

    allEntries.forEach(entry => {
      const qKey = entry.question.toLowerCase().trim();
      if (!seen.has(qKey)) {
        unique.push(entry);
        seen.add(qKey);
      }
    });

    // Link related questions
    unique.forEach((entry, idx) => {
      const relatedIds = [];
      const queryWords = new Set(entry.keywords);

      unique.forEach((other, otherIdx) => {
        if (idx !== otherIdx) {
          const otherWords = new Set(other.keywords);
          const intersection = [...queryWords].filter(w => otherWords.has(w));

          if (intersection.length >= 2) { // At least 2 keywords in common
            relatedIds.push(other.id);
          }
        }
      });

      entry.relatedQuestions = relatedIds.slice(0, 5); // Limit to 5 related
    });

    return {
      version: 2,
      lastUpdated: new Date().toISOString(),
      totalEntries: unique.length,
      productCategories: ['jewelry', 'sneakers', 'designer', 'electronics', 'accessories', 'streetwear'],
      entries: unique,
      productTypeKeywords: PRODUCT_TYPES,
      synonyms: SYNONYMS
    };
  }

  // Public API
  return {
    SYNONYMS,
    PRODUCT_TYPES,
    extractFromFAQ2,
    extractFromProductPage,
    generateKeywords,
    detectProductTypes,
    buildMasterKB,

    // Extract all entries from current page
    extractCurrentPage() {
      const pageName = document.title || 'Unknown';
      const entries = [];

      // Try FAQ2 format first
      if (document.querySelector('.faq2-section')) {
        const productType = pageName.includes('jewelry') ? 'jewelry' :
                           pageName.includes('sneaker') ? 'sneakers' :
                           pageName.includes('designer') ? 'designer' :
                           pageName.includes('electronic') ? 'electronics' :
                           pageName.includes('accessorie') ? 'accessories' :
                           pageName.includes('streetwear') ? 'streetwear' : 'general';

        return this.extractFromFAQ2(document.documentElement.outerHTML, productType, pageName);
      }

      // Try product page format
      if (document.querySelector('details[class*="faq"], [class*="section-faq"]')) {
        const productType = pageName.includes('jewelry') ? 'jewelry' :
                           pageName.includes('designer') ? 'designer' :
                           pageName.includes('electronic') ? 'electronics' :
                           pageName.includes('accessorie') ? 'accessories' : 'general';

        return this.extractFromProductPage(productType, pageName);
      }

      return entries;
    },

    // Download extracted data as JSON
    downloadAsJSON(data, filename = 'evb-knowledge-advanced.json') {
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    },

    // Log stats
    logStats(kb) {
      console.log('=== Knowledge Base Stats ===');
      console.log(`Total Entries: ${kb.totalEntries}`);
      console.log(`Version: ${kb.version}`);
      console.log(`Last Updated: ${kb.lastUpdated}`);
      console.log(`Product Categories: ${kb.productCategories.join(', ')}`);
      console.log(`Average Keywords per Entry: ${(kb.entries.reduce((sum, e) => sum + e.keywords.length, 0) / kb.totalEntries).toFixed(1)}`);
    }
  };
})();

// Export for Node.js if available
if (typeof module !== 'undefined' && module.exports) {
  module.exports = KnowledgeExtractor;
}
