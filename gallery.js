(function() {
    'use strict';
    const CONFIG = {
        repo: 'heartquotelabs-cell/p_romo_hql',
        folder: 'images/'
    };
    const GITHUB_API = 'https://api.github.com';
    const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'];
    let imageObserver;
    let elements;
    window.initGallery = function(galleryElements) {
        elements = galleryElements;
        initLazyLoading();
        fetchAndDisplayImages();
    };
    function initLazyLoading() {
        imageObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    loadImage(img);
                    imageObserver.unobserve(img);
                }
            });
        }, {
            rootMargin: '150px',
            threshold: 0.01
        });}
    function loadImage(img) {
        const src = img.getAttribute('data-src');
        if (!src) return;
        const wrapper = img.closest('.image-wrapper');
        const tempImage = new Image();
        tempImage.onload = function() {
            img.src = src;
            img.classList.add('loaded');
            
            if (wrapper) {
                wrapper.classList.add('loaded');}
            const card = img.closest('.image-card');
            if (card) {
                const dimElement = card.querySelector('.image-dimensions');
                if (dimElement) {
                    dimElement.textContent = `${this.naturalWidth} × ${this.naturalHeight}`;
                }
            }
        };
        
        tempImage.onerror = function() {
            img.src = 'data:image/svg+xml,' + encodeURIComponent(`
                <svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
                    <rect fill="#f0f0f5" width="400" height="300"/>
                    <text fill="#86868b" font-size="16" x="50%" y="50%" text-anchor="middle" dy=".3em" font-family="-apple-system, sans-serif">
                        Unable to load
                    </text>
                </svg>
            `);
            img.classList.add('loaded');
            if (wrapper) wrapper.classList.add('loaded');
        };
        
        tempImage.src = src;
    }

    function isImageFile(filename) {
        const lower = filename.toLowerCase();
        return IMAGE_EXTENSIONS.some(ext => lower.endsWith(ext));
    }

    async function fetchImagesFromGitHub() {
        const cleanPath = CONFIG.folder.replace(/^\/+|\/+$/g, '') + '/';
        const apiUrl = `${GITHUB_API}/repos/${CONFIG.repo}/contents/${cleanPath}`;
        
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
            if (response.status === 403) {
                throw new Error('GitHub API rate limit reached. Please try again later.');
            } else if (response.status === 404) {
                throw new Error('Repository or folder not found. Please check the configuration.');
            } else {
                throw new Error(`GitHub API error (${response.status})`);
            }
        }
        
        const data = await response.json();
        const items = Array.isArray(data) ? data : [data];
        
        return items
            .filter(item => item.type === 'file' && isImageFile(item.name))
            .map(file => ({
                name: file.name,
                url: file.download_url,
                size: file.size
            }));
    }

    function displayImages(images) {
        if (!elements || !elements.gallery) return;
        
        elements.gallery.innerHTML = '';
        
        if (images.length === 0) {
            elements.loadingState.innerHTML = `
                <div style="text-align:center;padding:40px;">
                    <div style="font-size:40px;">🖼️</div>
                    <div style="font-size:17px;font-weight:500;color:#1d1d1f;margin-top:12px;">No images found</div>
                    <div style="font-size:14px;color:#86868b;">Add images to your repository folder</div>
                </div>
            `;
            elements.loadingState.style.display = 'flex';
            if (elements.imageCount) elements.imageCount.textContent = '';
            return;
        }
        
        if (elements.imageCount) {
            elements.imageCount.textContent = `${images.length} photo${images.length !== 1 ? 's' : ''}`;
        }
        
        if (elements.loadingState) {
            elements.loadingState.style.display = 'none';
        }
        
        images.forEach(image => {
            const card = document.createElement('div');
            card.className = 'image-card';
            
            card.innerHTML = `
                <div class="image-wrapper shimmer">
                    <img 
                        data-src="${image.url}" 
                        alt="${image.name}"
                    >
                </div>
                <div class="image-info">
                    <div class="image-name" title="${image.name}">${image.name}</div>
                    <div class="image-dimensions"></div>
                </div>
            `;
            
            card.addEventListener('click', () => {
                if (typeof window.openLightbox === 'function') {
                    window.openLightbox(image.url, image.name);
                }
            });
            
            elements.gallery.appendChild(card);
            
            const img = card.querySelector('img');
            if (imageObserver) {
                imageObserver.observe(img);
            }
        });
    }

    function showError(message) {
        if (!elements || !elements.loadingState) return;
        
        elements.loadingState.innerHTML = `
            <div style="text-align:center;padding:40px;">
                <div style="font-size:40px;">⚠️</div>
                <div style="font-size:17px;font-weight:500;color:#1d1d1f;margin-top:12px;">Error loading images</div>
                <div style="font-size:14px;color:#86868b;">${message}</div>
            </div>
        `;
        elements.loadingState.style.display = 'flex';
        if (elements.imageCount) elements.imageCount.textContent = '';
    }

    async function fetchAndDisplayImages() {
        try {
            const images = await fetchImagesFromGitHub();
            displayImages(images);
        } catch (error) {
            console.error('Gallery error:', error);
            showError(error.message);
        }}
    if (window.galleryElements) {
        initGallery(window.galleryElements);}})();