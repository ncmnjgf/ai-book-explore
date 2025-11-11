// script.js - Complete BookVerse Application with OpenLibrary + Gemini Integration
class BooksAPI {
    static async searchBooks(query, startIndex = 0, maxResults = 12) {
        try {
            console.log('🔍 Searching OpenLibrary for:', query);
            
            const response = await fetch(
                `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&page=1&limit=${maxResults}`
            );

            if (!response.ok) throw new Error(`OpenLibrary API error: ${response.status}`);

            const data = await response.json();
            
            if (data.docs && data.docs.length > 0) {
                const books = data.docs.map((book, index) => ({
                    id: book.key || `book-${index}`,
                    title: book.title || 'Unknown Title',
                    authors: book.author_name || ['Unknown Author'],
                    publishedDate: book.first_publish_year || 'Unknown',
                    description: book.description || 'Description available in detailed view',
                    categories: book.subject ? book.subject.slice(0, 3) : ['General'],
                    thumbnail: book.cover_i ? `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg` : null,
                    previewLink: `https://openlibrary.org${book.key}`,
                    pageCount: book.number_of_pages_median || null,
                    averageRating: 4.0,
                    isbn: book.isbn ? book.isbn[0] : null
                }));
                
                console.log(`✅ Found ${books.length} books from OpenLibrary`);
                return books;
            } else {
                return this.getSampleBooks(query);
            }

        } catch (error) {
            console.error('❌ OpenLibrary search failed:', error);
            return this.getSampleBooks(query);
        }
    }

    static async getBookDetails(bookId) {
        try {
            console.log('📖 Fetching book details from OpenLibrary for:', bookId);
            
            // Clean the ID (remove /works/ if present)
            const cleanId = bookId.replace('/works/', '');
            
            const response = await fetch(`https://openlibrary.org/works/${cleanId}.json`);
            
            if (!response.ok) throw new Error(`OpenLibrary details error: ${response.status}`);

            const bookData = await response.json();
            console.log('📚 Raw OpenLibrary data:', bookData);
            
            // Get detailed description and content
            let fullDescription = 'No description available';
            if (bookData.description) {
                fullDescription = typeof bookData.description === 'string' 
                    ? bookData.description 
                    : bookData.description.value || 'Description available';
            }

            // Get author names
            let authors = ['Unknown Author'];
            let authorDetails = [];
            if (bookData.authors && bookData.authors.length > 0) {
                authorDetails = await Promise.all(
                    bookData.authors.map(async (author) => {
                        try {
                            const authorResponse = await fetch(`https://openlibrary.org${author.author.key}.json`);
                            const authorData = await authorResponse.json();
                            return {
                                name: authorData.name || 'Unknown Author',
                                bio: authorData.bio || 'No biography available',
                                birth_date: authorData.birth_date || 'Unknown'
                            };
                        } catch {
                            return {
                                name: 'Unknown Author',
                                bio: 'No biography available',
                                birth_date: 'Unknown'
                            };
                        }
                    })
                );
                authors = authorDetails.map(author => author.name);
            }

            const book = {
                id: cleanId,
                title: bookData.title || 'Unknown Title',
                authors: authors,
                authorDetails: authorDetails,
                publishedDate: bookData.first_publish_date || 'Unknown',
                description: fullDescription,
                categories: bookData.subjects ? bookData.subjects.slice(0, 5) : ['General'],
                subjects: bookData.subjects || [],
                thumbnail: bookData.covers && bookData.covers[0] ? 
                    `https://covers.openlibrary.org/b/id/${bookData.covers[0]}-L.jpg` : null,
                previewLink: `https://openlibrary.org/works/${cleanId}`,
                pageCount: bookData.number_of_pages || null,
                averageRating: 4.0,
                // Additional OpenLibrary specific data
                firstSentence: bookData.first_sentence || null,
                links: bookData.links || [],
                excerpts: bookData.excerpts || []
            };

            console.log('📖 Processed book data for Gemini:', book);
            return book;

        } catch (error) {
            console.error('❌ Book details failed:', error);
            return this.getSampleBooks().find(book => book.id === bookId) || this.getSampleBooks()[0];
        }
    }

    static getSampleBooks(query = '') {
        const allBooks = [
            {
                id: 'OL82565W',
                title: 'Harry Potter and the Philosopher\'s Stone',
                authors: ['J.K. Rowling'],
                publishedDate: '1997',
                description: 'Harry Potter discovers he is a wizard and begins his education at Hogwarts School of Witchcraft and Wizardry.',
                categories: ['Fantasy', 'Fiction'],
                thumbnail: 'https://covers.openlibrary.org/b/id/10514553-M.jpg',
                previewLink: 'https://openlibrary.org/works/OL82565W',
                pageCount: 223,
                averageRating: 4.5
            }
        ];

        if (query) {
            const queryLower = query.toLowerCase();
            return allBooks.filter(book => 
                book.title.toLowerCase().includes(queryLower) ||
                book.authors.some(author => author.toLowerCase().includes(queryLower))
            );
        }

        return allBooks;
    }
}

class GeminiAPI {
    static GEMINI_API_KEY = "AIzaSyAnUANAyuycJDg9rf0sml1xvQdPlZlcSgk";
    static GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${this.GEMINI_API_KEY}`;

    static async askQuestionAboutBook(book, question) {
        try {
            console.log('🤖 Sending to Gemini API - Book:', book.title);
            console.log('📚 Book data being sent:', {
                title: book.title,
                authors: book.authors,
                description: book.description?.substring(0, 100) + '...',
                categories: book.categories,
                subjects: book.subjects
            });
            
            const prompt = this.createPrompt(book, question);
            console.log('📝 Prompt sent to Gemini:', prompt.substring(0, 200) + '...');
            
            const response = await fetch(this.GEMINI_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: prompt
                        }]
                    }],
                    generationConfig: {
                        temperature: 0.7,
                        topK: 40,
                        topP: 0.95,
                        maxOutputTokens: 1024,
                    }
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error('❌ Gemini API error response:', errorData);
                throw new Error(`Gemini API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
            }

            const data = await response.json();
            console.log('✅ Gemini API response received:', data);
            
            if (data.candidates && data.candidates[0] && data.candidates[0].content) {
                const answer = data.candidates[0].content.parts[0].text;
                console.log('🎯 Gemini answer:', answer.substring(0, 100) + '...');
                return answer;
            } else {
                throw new Error('Invalid response format from Gemini API');
            }

        } catch (error) {
            console.error('❌ Gemini API failed:', error);
            return this.generateFallbackResponse(book, question);
        }
    }

    static createPrompt(book, question) {
        // Build comprehensive book information from OpenLibrary data
        const bookInfo = `
EXACT BOOK DATA FROM OPENLIBRARY API:

BOOK ID: ${book.id}
TITLE: "${book.title}"
AUTHOR(S): ${book.authors ? book.authors.join(', ') : 'Unknown Author'}
PUBLICATION YEAR: ${book.publishedDate || 'Unknown'}
DESCRIPTION: ${book.description || 'No description available'}
CATEGORIES: ${book.categories ? book.categories.join(', ') : 'General'}
SUBJECTS: ${book.subjects ? book.subjects.slice(0, 10).join(', ') : 'No subjects available'}
PAGE COUNT: ${book.pageCount || 'Unknown'}
${book.firstSentence ? `FIRST SENTENCE: ${book.firstSentence}` : ''}
${book.authorDetails ? `AUTHOR BIO: ${book.authorDetails[0]?.bio || 'No biography available'}` : ''}
${book.excerpts && book.excerpts.length > 0 ? `BOOK EXCERPTS: ${book.excerpts.map(e => e.excerpt).join('\n')}` : ''}
`.trim();

        return `
You are an expert book analyst. I will provide you with exact book data from the OpenLibrary API, and you must answer the user's question using ONLY this specific book information.

${bookInfo}

USER'S SPECIFIC QUESTION: "${question}"

CRITICAL INSTRUCTIONS:
1. Use ONLY the book information provided above from OpenLibrary API
2. Do not use any external knowledge or general information about similar books
3. If the OpenLibrary data doesn't contain information to answer the question, clearly state this
4. Be specific and reference the exact data points from the OpenLibrary response
5. If describing the book, use the exact description, categories, and subjects provided
6. If discussing authors, use only the author information from the API
7. Structure your response to be helpful and informative based on the available data

IMPORTANT: Your response must be based SOLELY on the OpenLibrary data provided above. Do not add any external knowledge.

Now, please answer the user's question using only the provided OpenLibrary book data:
        `.trim();
    }

    static generateFallbackResponse(book, question) {
        return `I'm analyzing "${book.title}" by ${book.authors ? book.authors.join(', ') : 'Unknown Author'} based on OpenLibrary data.

Question: "${question}"

OpenLibrary Book Data Available:
• Title: ${book.title}
• Authors: ${book.authors ? book.authors.join(', ') : 'Unknown'}
• Published: ${book.publishedDate || 'Unknown'}
• Description: ${book.description || 'No description available'}
• Categories: ${book.categories ? book.categories.join(', ') : 'General'}
${book.subjects ? `• Subjects: ${book.subjects.slice(0, 5).join(', ')}` : ''}

Based on the OpenLibrary data, this book appears to be about: ${book.description || 'topics related to ' + (book.categories ? book.categories.join(', ') : 'general subjects')}.

For more specific answers, the complete book would provide additional details.`;
    }
}

// Main Application
class BookVerseApp {
    constructor() {
        this.booksContainer = document.getElementById('books-container');
        this.bookModal = document.getElementById('book-modal');
        this.closeModalBtn = document.querySelector('.close-modal');
        this.modalBookTitle = document.getElementById('modal-book-title');
        this.modalBookAuthor = document.getElementById('modal-book-author');
        this.modalBookDescription = document.getElementById('modal-book-description');
        this.modalBookYear = document.getElementById('modal-book-year');
        this.modalBookGenre = document.getElementById('modal-book-genre');
        this.modalBookRating = document.getElementById('modal-book-rating');
        this.modalBookImage = document.getElementById('modal-book-image');
        this.modalBookPlaceholder = document.getElementById('modal-book-placeholder');
        this.aiSearchForm = document.getElementById('ai-search-form');
        this.aiQuestionInput = document.getElementById('ai-question');
        this.aiResponseText = document.getElementById('ai-response-text');
        this.aiLoading = document.getElementById('ai-loading');
        this.readBookBtn = document.getElementById('read-book-btn');
        this.bookSearchInput = document.getElementById('book-search');
        this.searchBtn = document.getElementById('search-btn');
        this.globalSearchInput = document.getElementById('global-search');
        this.globalSearchBtn = document.getElementById('global-search-btn');
        this.booksLoading = document.getElementById('books-loading');
        this.loadMoreBtn = document.getElementById('load-more');

        this.currentBook = null;
        this.currentPage = 0;
        this.currentSearchQuery = "harry potter";
        this.isLoading = false;

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadBooks();
    }

    setupEventListeners() {
        // Book card click events
        document.addEventListener('click', (e) => {
            if (e.target.closest('.view-book-btn')) {
                const bookId = e.target.closest('.view-book-btn').getAttribute('data-id');
                this.openBookModal(bookId);
            }
            
            if (e.target.closest('.favorite-btn')) {
                const bookId = e.target.closest('.favorite-btn').getAttribute('data-id');
                this.toggleFavorite(bookId, e.target.closest('.favorite-btn'));
            }
        });

        // Close modal
        this.closeModalBtn.addEventListener('click', () => this.closeModal());
        window.addEventListener('click', (e) => {
            if (e.target === this.bookModal) {
                this.closeModal();
            }
        });

        // AI search form
        this.aiSearchForm.addEventListener('submit', (e) => this.handleAISearch(e));

        // Read book button
        this.readBookBtn.addEventListener('click', () => {
            if (this.currentBook && this.currentBook.previewLink) {
                window.open(this.currentBook.previewLink, '_blank');
            } else if (this.currentBook) {
                alert(`No preview available for "${this.currentBook.title}". Visit OpenLibrary for more details.`);
            }
        });

        // Search functionality
        this.searchBtn.addEventListener('click', () => this.handleSearch());
        this.bookSearchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleSearch();
        });

        // Global search
        this.globalSearchBtn.addEventListener('click', () => this.handleGlobalSearch());
        this.globalSearchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleGlobalSearch();
        });

        // Load more books
        this.loadMoreBtn.addEventListener('click', () => this.loadMoreBooks());

        // Smooth scrolling
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = anchor.getAttribute('href');
                if (targetId === '#') return;
                
                const targetElement = document.querySelector(targetId);
                if (targetElement) {
                    window.scrollTo({
                        top: targetElement.offsetTop - 80,
                        behavior: 'smooth'
                    });
                }
            });
        });

        // Navbar scroll effect
        window.addEventListener('scroll', () => {
            const header = document.querySelector('header');
            if (window.scrollY > 100) {
                header.style.boxShadow = '0 5px 20px rgba(0,0,0,0.4)';
            } else {
                header.style.boxShadow = '0 2px 15px rgba(0,0,0,0.4)';
            }
        });
    }

    handleSearch() {
        this.currentSearchQuery = this.bookSearchInput.value.trim() || "harry potter";
        this.currentPage = 0;
        this.booksContainer.innerHTML = '';
        this.loadBooks();
    }

    handleGlobalSearch() {
        this.currentSearchQuery = this.globalSearchInput.value.trim() || "harry potter";
        this.currentPage = 0;
        this.booksContainer.innerHTML = '';
        this.loadBooks();
        document.getElementById('books').scrollIntoView({ behavior: 'smooth' });
    }

    async loadMoreBooks() {
        if (this.isLoading) return;
        this.currentPage++;
        await this.loadBooks(false);
    }

    async loadBooks(clearContainer = true) {
        if (this.isLoading) return;
        
        this.isLoading = true;
        this.booksLoading.style.display = 'block';
        this.loadMoreBtn.disabled = true;
        
        try {
            const books = await BooksAPI.searchBooks(this.currentSearchQuery, this.currentPage * 12);
            
            if (books && books.length > 0) {
                this.displayBooks(books, clearContainer);
                this.loadMoreBtn.style.display = 'block';
                this.showNotification(`Found ${books.length} books for "${this.currentSearchQuery}" from OpenLibrary`, 'success');
            } else {
                if (clearContainer) {
                    this.booksContainer.innerHTML = '<p class="no-results">No books found. Try a different search.</p>';
                }
                this.loadMoreBtn.style.display = 'none';
            }
        } catch (error) {
            console.error('Error loading books:', error);
            if (clearContainer) {
                this.booksContainer.innerHTML = '<p class="error">Error loading books. Please try again.</p>';
            }
            this.showNotification('Error loading from OpenLibrary. Using sample data.', 'error');
            
            const sampleBooks = BooksAPI.getSampleBooks(this.currentSearchQuery);
            if (sampleBooks && sampleBooks.length > 0) {
                this.displayBooks(sampleBooks, clearContainer);
            }
        } finally {
            this.isLoading = false;
            this.booksLoading.style.display = 'none';
            this.loadMoreBtn.disabled = false;
        }
    }

    displayBooks(books, clearContainer = true) {
        if (clearContainer) {
            this.booksContainer.innerHTML = '';
        }
        
        books.forEach(book => {
            const bookCard = this.createBookCard(book);
            this.booksContainer.appendChild(bookCard);
        });
    }

    createBookCard(book) {
        const bookCard = document.createElement('div');
        bookCard.className = 'book-card';
        
        const title = book.title || 'Unknown Title';
        const author = book.authors ? book.authors.join(', ') : 'Unknown Author';
        const year = book.publishedDate || 'Unknown';
        const coverUrl = book.thumbnail || null;
        
        bookCard.innerHTML = `
            <div class="book-cover">
                ${coverUrl ? 
                    `<img src="${coverUrl}" alt="${title}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">` : 
                    ''
                }
                <div class="book-image-placeholder" ${coverUrl ? 'style="display: none;"' : ''}>
                    <i class="fas fa-book"></i>
                </div>
            </div>
            <div class="book-info">
                <h3 class="book-title">${title}</h3>
                <p class="book-author">by ${author}</p>
                <p class="book-year">Published: ${year}</p>
                <div class="book-actions">
                    <button class="btn btn-primary view-book-btn" data-id="${book.id}">
                        <i class="fas fa-eye"></i> View Details
                    </button>
                    <button class="btn btn-outline favorite-btn" data-id="${book.id}">
                        <i class="far fa-heart"></i> Favorite
                    </button>
                </div>
            </div>
        `;
        
        return bookCard;
    }

    async openBookModal(bookId) {
        try {
            this.booksLoading.style.display = 'block';
            
            // Fetch complete book details from OpenLibrary
            console.log('🔄 Fetching detailed book data from OpenLibrary...');
            this.currentBook = await BooksAPI.getBookDetails(bookId);
            console.log('✅ Book data loaded for Gemini:', this.currentBook);
            
            this.updateModalContent(this.currentBook);
            
            this.bookModal.style.display = 'block';
            document.body.style.overflow = 'hidden';
            
        } catch (error) {
            console.error('Error opening book modal:', error);
            this.showNotification('Error loading book details from OpenLibrary.', 'error');
        } finally {
            this.booksLoading.style.display = 'none';
        }
    }

    updateModalContent(book) {
        this.modalBookTitle.textContent = book.title;
        this.modalBookAuthor.textContent = `by ${book.authors ? book.authors.join(', ') : 'Unknown Author'}`;
        this.modalBookDescription.textContent = book.description || 'No description available from OpenLibrary.';
        this.modalBookYear.textContent = book.publishedDate || 'Unknown';
        this.modalBookGenre.textContent = book.categories ? book.categories.join(', ') : 'General';
        this.modalBookRating.textContent = book.averageRating || '4.0';
        
        // Update book cover
        if (book.thumbnail) {
            this.modalBookImage.src = book.thumbnail;
            this.modalBookImage.style.display = 'block';
            this.modalBookPlaceholder.style.display = 'none';
        } else {
            this.modalBookImage.style.display = 'none';
            this.modalBookPlaceholder.style.display = 'flex';
        }
        
        // Reset AI response
        this.aiResponseText.textContent = 'Ask a question about this book and Gemini AI will analyze the OpenLibrary data to answer it.';
        this.aiQuestionInput.value = '';
    }

    closeModal() {
        this.bookModal.style.display = 'none';
        document.body.style.overflow = 'auto';
        this.currentBook = null;
    }

    toggleFavorite(bookId, button) {
        const icon = button.querySelector('i');
        const isFavorited = icon.classList.contains('fas');
        
        if (!isFavorited) {
            icon.classList.remove('far');
            icon.classList.add('fas');
            button.innerHTML = `<i class="fas fa-heart"></i> Favorited`;
            
            const favorites = JSON.parse(localStorage.getItem('bookFavorites') || '[]');
            if (!favorites.includes(bookId)) {
                favorites.push(bookId);
                localStorage.setItem('bookFavorites', JSON.stringify(favorites));
            }
            
            this.showNotification(`Added to your favorites!`);
        } else {
            icon.classList.remove('fas');
            icon.classList.add('far');
            button.innerHTML = `<i class="far fa-heart"></i> Favorite`;
            
            const favorites = JSON.parse(localStorage.getItem('bookFavorites') || '[]');
            const index = favorites.indexOf(bookId);
            if (index > -1) {
                favorites.splice(index, 1);
                localStorage.setItem('bookFavorites', JSON.stringify(favorites));
            }
            
            this.showNotification(`Removed from your favorites!`);
        }
    }

    async handleAISearch(e) {
        e.preventDefault();
        
        const question = this.aiQuestionInput.value.trim();
        if (!question) {
            this.showNotification('Please enter a question about the book.', 'error');
            return;
        }
        
        if (!this.currentBook) {
            this.showNotification('No book selected. Please select a book first.', 'error');
            return;
        }
        
        // Show loading indicator
        this.aiLoading.style.display = 'block';
        this.aiResponseText.textContent = 'Analyzing OpenLibrary data with Gemini AI...';
        
        try {
            console.log('🚀 Sending question to Gemini with book data...');
            const response = await GeminiAPI.askQuestionAboutBook(this.currentBook, question);
            this.aiResponseText.textContent = response;
            console.log('✅ Gemini response displayed');
        } catch (error) {
            console.error('Error calling Gemini API:', error);
            this.aiResponseText.textContent = `Sorry, there was an error processing your question with Gemini AI.\n\nError: ${error.message}\n\nPlease try again.`;
        } finally {
            this.aiLoading.style.display = 'none';
        }
    }

    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 100px;
            right: 20px;
            background: ${type === 'error' ? '#ff4444' : '#00ADB5'};
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 5px;
            z-index: 3000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            animation: slideIn 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
}

// Add notification styles
const notificationStyles = document.createElement('style');
notificationStyles.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(notificationStyles);

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new BookVerseApp();
});