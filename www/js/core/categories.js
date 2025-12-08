/**
 * Expense Categories
 * Centralized list used by both Expenses and Recurring Expenses
 */

const ExpenseCategories = {
    categories: [
        {
            id: 'groceries',
            name: 'Groceries',
            icon: '🛒',
            description: 'Groceries shopping, food items, household consumables',
            color: 'from-green-500 to-emerald-600'
        },
        {
            id: 'food-dining',
            name: 'Food & Dining',
            icon: '🍽️',
            description: 'Restaurant dining, food delivery, snacks, drinks',
            color: 'from-orange-500 to-red-600'
        },
        {
            id: 'shopping',
            name: 'Shopping',
            icon: '🛍️',
            description: 'Clothes, accessories, footwear, general shopping',
            color: 'from-pink-500 to-rose-600'
        },
        {
            id: 'healthcare',
            name: 'Healthcare',
            icon: '🏥',
            description: 'Doctor consultations, vaccinations, health issues, medicines',
            color: 'from-red-500 to-pink-600'
        },
        {
            id: 'insurance',
            name: 'Insurance',
            icon: '🛡️',
            description: 'Life, health, term, vehicle insurance premiums',
            color: 'from-blue-500 to-indigo-600'
        },
        {
            id: 'transportation',
            name: 'Transportation',
            icon: '🚗',
            description: 'Petrol, car/bike maintenance, cab/bus fares',
            color: 'from-gray-500 to-slate-600'
        },
        {
            id: 'travel',
            name: 'Travel',
            icon: '✈️',
            description: 'Flights, long-distance trains, hotels, vacations',
            color: 'from-sky-500 to-blue-600'
        },
        {
            id: 'bills-utilities',
            name: 'Bills & Utilities',
            icon: '💡',
            description: 'Electricity, water, gas, internet, phone, rent, maintenance',
            color: 'from-yellow-500 to-orange-600'
        },
        {
            id: 'subscriptions',
            name: 'Subscriptions',
            icon: '📱',
            description: 'Streaming services, digital subscriptions, memberships',
            color: 'from-purple-500 to-indigo-600'
        },
        {
            id: 'home-appliances',
            name: 'Home & Appliances',
            icon: '🏠',
            description: 'Washing machine, fridge, TV, household equipment',
            color: 'from-teal-500 to-cyan-600'
        },
        {
            id: 'events',
            name: 'Events',
            icon: '🎉',
            description: 'Birthday functions, marriage ceremonies, social/family events',
            color: 'from-fuchsia-500 to-pink-600'
        },
        {
            id: 'entertainment',
            name: 'Entertainment',
            icon: '🎬',
            description: 'Movies in theatres, recreation, leisure activities',
            color: 'from-violet-500 to-purple-600'
        },
        {
            id: 'education',
            name: 'Education',
            icon: '📚',
            description: 'School fees, tuition, books, courses, educational materials',
            color: 'from-indigo-500 to-blue-600'
        },
        {
            id: 'personal-family',
            name: 'Personal & Family',
            icon: '👨‍👩‍👧‍👦',
            description: 'Family support, gifts, personal care, grooming',
            color: 'from-rose-500 to-pink-600'
        },
        {
            id: 'gifts',
            name: 'Gifts',
            icon: '🎁',
            description: 'Money gifted to family/relatives (non-returnable)',
            color: 'from-amber-500 to-yellow-600'
        },
        {
            id: 'donations',
            name: 'Donations',
            icon: '🙏',
            description: 'Charity, temple/religious donations, social contributions',
            color: 'from-lime-500 to-green-600'
        },
        {
            id: 'emi',
            name: 'EMI',
            icon: '💳',
            description: 'Credit card EMIs, bank loan EMIs, installment payments',
            color: 'from-blue-500 to-cyan-600'
        },
        {
            id: 'other',
            name: 'Other',
            icon: '📦',
            description: 'Miscellaneous uncategorized expenses',
            color: 'from-gray-400 to-gray-600'
        }
    ],
    
    /**
     * Get all categories
     */
    getAll() {
        return this.categories;
    },
    
    /**
     * Get category by ID
     */
    getById(id) {
        return this.categories.find(cat => cat.id === id);
    },
    
    /**
     * Get category by name
     */
    getByName(name) {
        return this.categories.find(cat => cat.name === name);
    },
    
    /**
     * Get category or default fallback (for backward compatibility)
     */
    getCategoryOrDefault(categoryName) {
        const category = this.getByName(categoryName);
        if (category) return category;
        
        // Fallback for missing/old categories
        return {
            id: 'other',
            name: categoryName || 'Other',
            icon: '📦',
            description: 'Uncategorized',
            color: 'from-gray-400 to-gray-600'
        };
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.ExpenseCategories = ExpenseCategories;
}

