// gallery.js - Image Gallery Logic
// Make sure this file is served with Content-Type: application/javascript

(function() {
    'use strict';

    // ============ CONFIGURATION ============
    const CONFIG = {
        repo: 'heartquotelabs-cell/p_romo_hql',
        folder: 'images/'
    };
    // ======================================

    const GITHUB_API = 'https://api.github.com';
    const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'];
    let imageObserver;
    let elements;

    window.initGallery = function(galleryElements) {
        if (!galleryElements) {
            console.error('initGallery: No elements provided');
            return;
        }
        elements = galleryElements;
        initLazyLoading();
        fetchAndDisplayImages();
    };

    function initLazyLoading() {
        if (!window.IntersectionObserver) {
            console.warn('IntersectionObserver not supported, loading all images immediately');
            return;
        }
        
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
        });
    }

    function loadImage(img) {
        const src = img.getAttribute('data-src');
        if (!src) return;

        const wrapper = img.closest('.image-wrapper');
        const tempImage = new Image();
        
        tempImage.onload = function() {
            img.src = src;
            img.classList.add('loaded');
            
            if (wrapper) {
                wrapper.classList.add('loaded');
            }
            
            const card = img.closest('.image-card');
            if (card) {
                const dimElement = card.querySelector('.image-dimensions');
                if (dimElement) {
                    dimElement.textContent = this.naturalWidth + ' \u00d7 ' + this.naturalHeight;
                }
            }
        };
        
        tempImage.onerror = function() {
            img.src = 'data:image/svg+xml,' + encodeURIComponent(
                '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">' +
                '<rect fill="#f0f0f5" width="400" height="300"/>' +
                '<text fill="#86868b" font-size="16" x="50%" y="50%" text-anchor="middle" dy=".3em" font-family="-apple-system, sans-serif">Unable to load</text>' +
                '</svg>'
            );
            img.classList.add('loaded');
            if (wrapper) wrapper.classList.add('loaded');
        };
        
        tempImage.src = src;
    }

    function isImageFile(filename) {
        var lower = filename.toLowerCase();
        return IMAGE_EXTENSIONS.some(function(ext) {
            return lower.endsWith(ext);
        });
    }

    function fetchImagesFromGitHub() {
        var cleanPath = CONFIG.folder.replace(/^\/+|\/+$/g, '') + '/';
        var apiUrl = GITHUB_API + '/repos/' + CONFIG.repo + '/contents/' + cleanPath;
        
        return fetch(apiUrl).then(function(response) {
            if (!response.ok) {
                if (response.status === 403) {
                    throw new Error('GitHub API rate limit reached. Please try again later.');
                } else if (response.status === 404) {
                    throw new Error('Repository or folder not found. Please check the configuration.');
                } else {
                    throw new Error('GitHub API error (' + response.status + ')');
                }
            }
            return response.json();
        }).then(function(data) {
            var items = Array.isArray(data) ? data : [data];
            
            return items.filter(function(item) {
                return item.type === 'file' && isImageFile(item.name);
            }).map(function(file) {
                return {
                    name: file.name,
                    url: file.download_url,
                    size: file.size
                };
            });
        });
    }

    function displayImages(images) {
        if (!elements || !elements.gallery) return;
        
        elements.gallery.innerHTML = '';
        
        if (!images || images.length === 0) {
            if (elements.loadingState) {
                elements.loadingState.innerHTML = '<div class="loading-state"><div style="font-size:40px;">\ud83d\uddbc\ufe0f</div><div style="font-size:17px;font-weight:500;color:#1d1d1f;margin-top:12px;">No images found</div><div style="font-size:14px;color:#86868b;">Add images to your repository folder</div></div>';
                elements.loadingState.style.display = 'flex';
            }
            if (elements.imageCount) elements.imageCount.textContent = '';
            return;
        }
        
        if (elements.imageCount) {
            elements.imageCount.textContent = images.length + ' photo' + (images.length !== 1 ? 's' : '');
        }
        
        if (elements.loadingState) {
            elements.loadingState.style.display = 'none';
        }
        
        images.forEach(function(image) {
            var card = document.createElement('div');
            card.className = 'image-card';
            
            card.innerHTML = '<div class="image-wrapper shimmer"><img data-src="' + image.url + '" alt="' + image.name + '"></div>' +
                            '<div class="image-info"><div class="image-name" title="' + image.name + '">' + image.name + '</div><div class="image-dimensions"></div></div>';
            
            card.addEventListener('click', function() {
                if (typeof window.openLightbox === 'function') {
                    window.openLightbox(image.url, image.name);
                }
            });
            
            elements.gallery.appendChild(card);
            
            var img = card.querySelector('img');
            if (imageObserver && img) {
                imageObserver.observe(img);
            } else if (img) {
                // Fallback: load immediately if observer not available
                loadImage(img);
            }
        });
    }

    function showError(message) {
        if (!elements || !elements.loadingState) return;
        
        elements.loadingState.innerHTML = '<div class="loading-state"><div style="font-size:40px;">\u26a0\ufe0f</div><div style="font-size:17px;font-weight:500;color:#1d1d1f;margin-top:12px;">Error loading images</div><div style="font-size:14px;color:#86868b;">' + message + '</div></div>';
        elements.loadingState.style.display = 'flex';
        if (elements.imageCount) elements.imageCount.textContent = '';
    }

    function fetchAndDisplayImages() {
        fetchImagesFromGitHub().then(function(images) {
            displayImages(images);
        }).catch(function(error) {
            console.error('Gallery error:', error);
            showError(error.message);
        });
    }

})();