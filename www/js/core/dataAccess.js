/**
 * Data Access Layer
 * Standardized database operations
 */

const DataAccess = {
    /**
     * Get single item by ID
     * @param {string} collection - Collection name
     * @param {number} id - Item ID
     * @returns {Object|null} - Item or null if not found
     */
    get(collection, id) {
        const items = this.getAll(collection);
        return items.find(item => item.id === parseInt(id)) || null;
    },

    /**
     * Get all items from collection
     * @param {string} collection - Collection name
     * @returns {Array} - Array of items
     */
    getAll(collection) {
        return window.DB[collection] || [];
    },

    /**
     * Save new item to collection
     * @param {string} collection - Collection name
     * @param {Object} data - Item data
     * @returns {Object} - Saved item with ID
     */
    save(collection, data) {
        if (!window.DB[collection]) {
            window.DB[collection] = [];
        }

        // Generate ID if not provided
        if (!data.id) {
            data.id = Date.now();
        }

        // Add timestamp
        if (!data.createdAt) {
            data.createdAt = Utils.getCurrentTimestamp();
        }

        window.DB[collection].push(data);
        window.Storage.save();

        return data;
    },

    /**
     * Update existing item
     * @param {string} collection - Collection name
     * @param {number} id - Item ID
     * @param {Object} updates - Updates to apply
     * @returns {Object|null} - Updated item or null if not found
     */
    update(collection, id, updates) {
        const items = this.getAll(collection);
        const index = items.findIndex(item => item.id === parseInt(id));

        if (index === -1) return null;

        // Add updated timestamp
        updates.updatedAt = Utils.getCurrentTimestamp();

        // Merge updates
        window.DB[collection][index] = {
            ...items[index],
            ...updates
        };

        window.Storage.save();

        return window.DB[collection][index];
    },

    /**
     * Delete item by ID
     * @param {string} collection - Collection name
     * @param {number} id - Item ID
     * @returns {boolean} - True if deleted, false if not found
     */
    delete(collection, id) {
        const items = this.getAll(collection);
        const index = items.findIndex(item => item.id === parseInt(id));

        if (index === -1) return false;

        window.DB[collection].splice(index, 1);
        window.Storage.save();

        return true;
    },

    /**
     * Filter items by predicate function
     * @param {string} collection - Collection name
     * @param {Function} predicate - Filter function
     * @returns {Array} - Filtered items
     */
    filter(collection, predicate) {
        const items = this.getAll(collection);
        return items.filter(predicate);
    },

    /**
     * Find single item by predicate
     * @param {string} collection - Collection name
     * @param {Function} predicate - Search function
     * @returns {Object|null} - Found item or null
     */
    findOne(collection, predicate) {
        const items = this.getAll(collection);
        return items.find(predicate) || null;
    },

    /**
     * Count items in collection
     * @param {string} collection - Collection name
     * @param {Function} predicate - Optional filter function
     * @returns {number} - Count of items
     */
    count(collection, predicate) {
        const items = this.getAll(collection);
        if (predicate) {
            return items.filter(predicate).length;
        }
        return items.length;
    },

    /**
     * Check if item exists
     * @param {string} collection - Collection name
     * @param {number} id - Item ID
     * @returns {boolean} - True if exists
     */
    exists(collection, id) {
        return this.get(collection, id) !== null;
    },

    /**
     * Get items by month
     * @param {string} collection - Collection name
     * @param {number} year - Year
     * @param {number} month - Month (1-12)
     * @param {string} dateField - Date field name (default 'date')
     * @returns {Array} - Filtered items
     */
    getByMonth(collection, year, month, dateField = 'date') {
        return this.filter(collection, item => {
            const date = new Date(item[dateField]);
            return date.getFullYear() === year && date.getMonth() + 1 === month;
        });
    },

    /**
     * Get items by date range
     * @param {string} collection - Collection name
     * @param {string} startDate - Start date (ISO format)
     * @param {string} endDate - End date (ISO format)
     * @param {string} dateField - Date field name (default 'date')
     * @returns {Array} - Filtered items
     */
    getByDateRange(collection, startDate, endDate, dateField = 'date') {
        const start = new Date(startDate);
        const end = new Date(endDate);

        return this.filter(collection, item => {
            const date = new Date(item[dateField]);
            return date >= start && date <= end;
        });
    },

    /**
     * Get items sorted by field
     * @param {string} collection - Collection name
     * @param {string} field - Field to sort by
     * @param {boolean} descending - Sort descending (default true)
     * @returns {Array} - Sorted items
     */
    getSorted(collection, field = 'date', descending = true) {
        const items = [...this.getAll(collection)];
        
        return items.sort((a, b) => {
            let aVal = a[field];
            let bVal = b[field];

            // Handle date fields
            if (field.toLowerCase().includes('date')) {
                aVal = new Date(aVal).getTime();
                bVal = new Date(bVal).getTime();
            }

            if (descending) {
                return bVal > aVal ? 1 : bVal < aVal ? -1 : 0;
            } else {
                return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
            }
        });
    },

    /**
     * Group items by field
     * @param {string} collection - Collection name
     * @param {string|Function} groupBy - Field name or function
     * @returns {Object} - Grouped items
     */
    groupBy(collection, groupBy) {
        const items = this.getAll(collection);
        return Utils.groupBy(items, groupBy);
    },

    /**
     * Calculate sum of field
     * @param {string} collection - Collection name
     * @param {string} field - Field to sum
     * @param {Function} filter - Optional filter function
     * @returns {number} - Sum
     */
    sum(collection, field, filter) {
        let items = this.getAll(collection);
        if (filter) {
            items = items.filter(filter);
        }
        return items.reduce((sum, item) => sum + (parseFloat(item[field]) || 0), 0);
    },

    /**
     * Calculate average of field
     * @param {string} collection - Collection name
     * @param {string} field - Field to average
     * @param {Function} filter - Optional filter function
     * @returns {number} - Average
     */
    average(collection, field, filter) {
        let items = this.getAll(collection);
        if (filter) {
            items = items.filter(filter);
        }
        if (items.length === 0) return 0;
        
        const sum = this.sum(collection, field, filter);
        return sum / items.length;
    },

    /**
     * Bulk save items
     * @param {string} collection - Collection name
     * @param {Array} items - Array of items to save
     * @returns {Array} - Saved items with IDs
     */
    bulkSave(collection, items) {
        const savedItems = items.map(item => this.save(collection, item));
        return savedItems;
    },

    /**
     * Bulk delete items
     * @param {string} collection - Collection name
     * @param {Array<number>} ids - Array of IDs to delete
     * @returns {number} - Number of items deleted
     */
    bulkDelete(collection, ids) {
        let deletedCount = 0;
        ids.forEach(id => {
            if (this.delete(collection, id)) {
                deletedCount++;
            }
        });
        return deletedCount;
    },

    /**
     * Clear entire collection
     * @param {string} collection - Collection name
     */
    clear(collection) {
        window.DB[collection] = [];
        window.Storage.save();
    },

    /**
     * Export collection data
     * @param {string} collection - Collection name
     * @returns {string} - JSON string
     */
    export(collection) {
        const items = this.getAll(collection);
        return JSON.stringify(items, null, 2);
    },

    /**
     * Import collection data
     * @param {string} collection - Collection name
     * @param {string} jsonData - JSON string
     * @param {boolean} append - Append or replace (default false)
     * @returns {boolean} - True if successful
     */
    import(collection, jsonData, append = false) {
        try {
            const items = JSON.parse(jsonData);
            if (!Array.isArray(items)) {
                throw new Error('Data must be an array');
            }

            if (append) {
                window.DB[collection] = [...this.getAll(collection), ...items];
            } else {
                window.DB[collection] = items;
            }

            window.Storage.save();
            return true;
        } catch (error) {
            console.error('Import failed:', error);
            return false;
        }
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.DataAccess = DataAccess;
}

