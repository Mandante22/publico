// === INICIALIZAÇÃO DO SUPABASE ===
const SUPABASE_URL = 'https://liywjnjmbzqlepdzarag.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpeXdqbmptYnpxbGVwZHphcmFnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1ODE1MTUzMiwiZXhwIjoyMDczNzI3NTMyfQ.JOMzpT2aog0rG0pHCJwvfl-pFTF60q3kgLOOijkYOBc';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

document.addEventListener('DOMContentLoaded', async function() {
    console.log('📄 DOM carregado. Iniciando carregamento de componentes...');

    // =============== CACHE GLOBAL ===============
    let cachedAnuncios = null;
    const CACHE_KEY = 'cached_anuncios';
    const CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutos

    async function getCachedAnuncios() {
        const now = Date.now();
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) {
            const { data, timestamp } = JSON.parse(cached);
            if (now - timestamp < CACHE_EXPIRY) {
                return data;
            }
        }
        return null;
    }

    async function setCachedAnuncios(data) {
        const cacheData = {
            data,
            timestamp: Date.now()
        };
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
    }

    async function fetchAnunciosFromDB() {
        const { data, error } = await supabaseClient
            .from('anuncios')
            .select('*')
            .eq('status', 'ativo');
        if (error) throw error;
        await setCachedAnuncios(data);
        return data;
    }

    async function getAnuncios() {
        let data = await getCachedAnuncios();
        if (!data) {
            data = await fetchAnunciosFromDB();
        }
        return data;
    }

    // --- NOVO CÓDIGO DO MAPA ---
    const chaveOpenCage = 'a1687c8c501b4f6bb05005fedfbd9662';

    async function getCoordinates(localizacao) {
        try {
            const response = await fetch(`https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(localizacao)}&key=${chaveOpenCage}`);
            const data = await response.json();
            
            if (data.results && data.results.length > 0) {
                const firstResult = data.results[0].geometry;
                return { lat: firstResult.lat, lng: firstResult.lng };
            }
            return null;
        } catch (error) {
            console.error('Erro ao obter coordenadas:', error);
            return null;
        }
    }

    // =============== BUSCA POR BAIRRO ===============
    window.buscarAnuncios = async function() {
        const termo = document.getElementById('searchBairro').value.trim().toLowerCase();
        if (!termo) {
            alert('Digite um bairro para buscar!');
            return;
        }

        const listaAnuncios = document.getElementById('listaAnuncios');
        const listaResultados = document.getElementById('listaResultados');
        const termoBuscaSpan = document.getElementById('termoBusca');

        listaAnuncios.innerHTML = `<div class="text-center"><div class="spinner-border text-danger" role="status"><span class="visually-hidden">Carregando...</span></div></div>`;
        listaResultados.classList.remove('d-none');
        termoBuscaSpan.textContent = termo;

        try {
            const { data, error } = await supabaseClient
                .from('anuncios')
                .select('*')
                .eq('status', 'ativo')
                .ilike('localizacao', `%${termo}%`);

            if (error) throw error;

            listaAnuncios.innerHTML = '';

            if (!data || data.length === 0) {
                listaAnuncios.innerHTML = '<div class="col-12"><div class="alert alert-info">Nenhum anúncio encontrado para este bairro.</div></div>';
                return;
            }

            let html = '';
            data.forEach(anuncio => {
                const fotos = anuncio.fotos ? JSON.parse(anuncio.fotos) : [];
                const fotoPrincipal = fotos[0] || anuncio.comprovante || 'https://via.placeholder.com/400x200?text=Sem+Foto';

                html += `
                    <div class="col-md-4 mb-4">
                        <div class="card h-100 shadow-sm">
                            <img src="${fotoPrincipal}" alt="${anuncio.titulo}" class="card-img-top" style="height: 200px; object-fit: cover;">
                            <div class="card-body">
                                <h5 class="card-title">${anuncio.titulo}</h5>
                                <p class="card-text">${anuncio.descricao.substring(0, 100)}...</p>
                                <p class="text-red fw-bold">${anuncio.preco.toLocaleString('pt-AO')} Kz/mês</p>
                                <p class="text-muted">📍 ${anuncio.localizacao}</p>
                                <button class="btn btn-outline-danger w-100 mb-2 abrir-chat" data-dono="Proprietário" data-whatsapp="${anuncio.contacto}">
                                    💬 Contactar
                                </button>
                                <a href="https://wa.me/${anuncio.contacto.replace(/\D/g, '')}" class="btn btn-whatsapp w-100" target="_blank">
                                    📱 WhatsApp
                                </a>
                            </div>
                        </div>
                    </div>
                `;
            });

            listaAnuncios.innerHTML = html;
            listaResultados.scrollIntoView({ behavior: 'smooth' });

        } catch (error) {
            console.error("Erro na busca:", error);
            listaAnuncios.innerHTML = `<p class="text-center text-danger">Erro ao buscar anúncios. Tente novamente.</p>`;
        }
    };

    // Permitir busca com Enter
    document.getElementById('searchBairro').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            buscarAnuncios();
        }
    });

    // =============== NOVO CARROSSEL EM GRID 2x2 ===============
    let currentCarouselIndex = 0;
    let carouselInterval;

    async function carregarCarrosselGrid() {
        const carouselContainer = document.getElementById('carouselDestaqueGrid');
        if (!carouselContainer) return;

        try {
            const data = await getAnuncios();
            if (!data || data.length === 0) {
                carouselContainer.innerHTML = '<p class="text-center text-muted">Nenhum anúncio disponível no momento.</p>';
                return;
            }

            // Agrupa os anúncios em grupos de 4
            const groups = [];
            for (let i = 0; i < data.length; i += 4) {
                groups.push(data.slice(i, i + 4));
            }

            // Limpa container
            carouselContainer.innerHTML = '';

            // Cria cada grupo como um "slide"
            groups.forEach((group, index) => {
                const groupDiv = document.createElement('div');
                groupDiv.className = `carousel-item-grid ${index === 0 ? 'active' : ''}`;
                groupDiv.style.display = 'grid';
                groupDiv.style.gridTemplateColumns = window.innerWidth <= 768 ? '1fr' : 'repeat(2, 1fr)';
                groupDiv.style.gap = '20px';

                group.forEach(anuncio => {
                    const fotos = anuncio.fotos ? JSON.parse(anuncio.fotos) : [];
                    const fotoPrincipal = fotos[0] || anuncio.comprovante || 'https://via.placeholder.com/400x200?text=Sem+Foto';

                    const cardHtml = `
                        <div class="card h-100">
                            <img src="${fotoPrincipal}" 
                                 alt="${anuncio.titulo}" 
                                 class="card-img-top" 
                                 style="height: 200px; object-fit: cover;"
                                 loading="lazy"
                                 data-bs-toggle="modal"
                                 data-bs-target="#modalVerMaisFotos"
                                 onclick="abrirModalGaleria('${anuncio.id}')">
                            <div class="card-body d-flex flex-column">
                                <h5 class="card-title">${anuncio.titulo}</h5>
                                <p class="card-text flex-grow-1">${anuncio.localizacao}</p>
                                <p class="text-red fw-bold">${anuncio.preco.toLocaleString('pt-AO')} Kz/mês</p>
                                <a href="https://wa.me/${anuncio.contacto.replace(/\D/g, '')}" class="btn btn-whatsapp w-100" target="_blank">
                                    📱 WhatsApp
                                </a>
                            </div>
                        </div>
                    `;
                    groupDiv.innerHTML += cardHtml;
                });

                carouselContainer.appendChild(groupDiv);
            });

            // Inicia rotação automática se tiver mais de 1 grupo
            if (groups.length > 1) {
                startAutoRotate(groups.length);
            }

            console.log('✅ Carrossel em grid carregado com sucesso.');

        } catch (error) {
            console.error('❌ Erro ao carregar carrossel em grid:', error);
            alert('Erro ao carregar destaques. Tente recarregar a página.');
        }
    }

    function startAutoRotate(totalGroups) {
        clearInterval(carouselInterval);
        carouselInterval = setInterval(() => {
            currentCarouselIndex = (currentCarouselIndex + 1) % totalGroups;
            updateActiveGroup();
        }, 5000); // Muda a cada 5 segundos
    }

    function updateActiveGroup() {
        const items = document.querySelectorAll('.carousel-item-grid');
        items.forEach((item, index) => {
            item.classList.toggle('active', index === currentCarouselIndex);
        });
    }

    // =============== MAPA INTERATIVO ===============
    async function carregarImoveisNoMapa() {
        try {
            if (!window.mapaInstance) {
                const angola = { lat: -11.2027, lng: 17.8739 };
                window.mapaInstance = L.map('mapa-interativo').setView(angola, 5);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap contributors',
                    maxZoom: 18,
                }).addTo(window.mapaInstance);
            }

            window.mapaInstance.eachLayer(layer => {
                if (layer instanceof L.Marker || layer instanceof L.CircleMarker) {
                    window.mapaInstance.removeLayer(layer);
                }
            });

            // Mostrar spinner
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'spinner-border text-danger position-absolute top-50 start-50';
            loadingDiv.setAttribute('role', 'status');
            loadingDiv.innerHTML = '<span class="visually-hidden">Carregando...</span>';
            document.getElementById('mapa-interativo').appendChild(loadingDiv);

            const { data, error } = await supabaseClient
                .from('anuncios')
                .select('*')
                .eq('status', 'ativo');

            if (error) throw error;

            for (const anuncio of data) {
                let coords = null;

                if (anuncio.latitude && anuncio.longitude) {
                    coords = { lat: anuncio.latitude, lng: anuncio.longitude };
                } else {
                    coords = await getCoordinates(anuncio.localizacao);
                    if (coords) {
                        await supabaseClient
                            .from('anuncios')
                            .update({
                                latitude: coords.lat,
                                longitude: coords.lng
                            })
                            .eq('id', anuncio.id);
                    }
                }

                if (coords) {
                    const marker = L.marker([coords.lat, coords.lng]).addTo(window.mapaInstance);
                    marker.bindTooltip(`
                        <div class="seta-tooltip">
                            <h5 class="mb-0">${anuncio.titulo}</h5>
                            <p class="mb-1">${anuncio.preco.toLocaleString('pt-AO')} Kz/mês</p>
                            <p class="mb-1"><strong>WhatsApp:</strong> ${anuncio.contacto}</p>
                            <a href="https://wa.me/${anuncio.contacto.replace(/\D/g, '')}" target="_blank" class="text-white-50 small">
                                📱 Mensagem agora
                            </a>
                        </div>
                    `).openTooltip();
                }
            }

            loadingDiv.remove();
            console.log('✅ Marcadores do mapa carregados com sucesso.');

        } catch (error) {
            console.error("Erro ao carregar anúncios para o mapa:", error);
            alert('Erro ao carregar mapa de anúncios.');
        }
    }

    // =============== DOWNLOAD CONTRATO ===============
    window.downloadContrato = function() {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        script.onload = function() {
            const { jsPDF } = window.jspdf;

            const doc = new jsPDF();
            doc.setFontSize(20);
            doc.text('CONTRATO DE ARRENDAMENTO', 14, 20);
            doc.setFontSize(12);
            doc.text([
                'Este contrato é celebrado entre:',
                '',
                'SENHORIO:',
                'Nome: __________________________________________________',
                'BI: _____________________________________________________',
                'Contacto: _______________________________________________',
                '',
                'INQUILINO:',
                'Nome: __________________________________________________',
                'BI: _____________________________________________________',
                'Contacto: _______________________________________________',
                '',
                'IMÓVEL:',
                'Endereço: _______________________________________________',
                'Valor: ______________________ Kz/mês',
                'Duração: _____ meses',
                '',
                'Luanda, ___ de ___________ de 2025',
                '',
                '___________________________     ___________________________',
                '         SENHORIO                         INQUILONO'
            ], 14, 40);

            doc.save('contrato_arrendamento_intermediario_online.pdf');
        };
        document.head.appendChild(script);
    };

    // Sanitiza nomes de arquivos
    function sanitizeFileName(name) {
        return name
            .replace(/[^a-zA-Z0-9._-]/g, '_')
            .replace(/\s+/g, '_');
    }

    // =============== ABRIR MODAL DE GALERIA ===============
    window.abrirModalGaleria = async function(anuncioId) {
        const { data: anuncio, error } = await supabaseClient
            .from('anuncios')
            .select('*')
            .eq('id', anuncioId)
            .single();

        if (error) {
            console.error('Erro ao carregar anúncio:', error);
            return;
        }

        document.getElementById('modalFotoPrincipal').src = anuncio.fotoPrincipal;
        document.getElementById('modalTitulo').textContent = anuncio.titulo;
        document.getElementById('modalPreco').textContent = `${anuncio.preco.toLocaleString('pt-AO')} Kz/mês`;
        document.getElementById('modalLocalizacao').textContent = anuncio.localizacao;
        document.getElementById('modalDescricao').textContent = anuncio.descricao;
        document.getElementById('modalWhatsapp').href = `https://wa.me/${anuncio.contacto.replace(/\D/g, '')}`;

        const galeria = document.getElementById('modalGaleria');
        galeria.innerHTML = '';

        const fotos = anuncio.fotos ? JSON.parse(anuncio.fotos) : [];

        if (fotos && fotos.length > 0) {
            fotos.forEach(url => {
                const img = document.createElement('img');
                img.src = url;
                img.style.cursor = 'pointer';
                img.onclick = () => {
                    document.getElementById('modalFotoPrincipal').src = url;
                };
                galeria.appendChild(img);
            });
        }

        if (!fotos.includes(anuncio.fotoPrincipal)) {
            const img = document.createElement('img');
            img.src = anuncio.fotoPrincipal;
            img.style.cursor = 'pointer';
            img.onclick = () => {
                document.getElementById('modalFotoPrincipal').src = anuncio.fotoPrincipal;
            };
            galeria.appendChild(img);
        }
    };

    // =============== ENVIO DO ANÚNCIO (FORMULÁRIO) ===============
    document.getElementById('formularioAnuncio').addEventListener('submit', async function(event) {
        event.preventDefault();
        
        const btnSubmit = this.querySelector('button[type="submit"]');
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = 'A enviar...';

        const titulo = document.getElementById('titulo').value;
        const descricao = document.getElementById('descricao').value;
        const localizacao = document.getElementById('localizacao').value;
        const preco = parseFloat(document.getElementById('preco').value);
        const contacto = document.getElementById('contacto').value;
        const pagamento = document.querySelector('input[name="pagamento"]:checked')?.value;
        const fotoPrincipalFile = document.getElementById('fotoPrincipal').files[0];
        const comprovanteFile = document.getElementById('comprovante').files[0];
        const fotosAdicionaisFiles = document.getElementById('fotosAdicionais')?.files || [];

        try {
            // Upload da foto principal
            const safeFotoPrincipalName = sanitizeFileName(fotoPrincipalFile.name);
            const fotoPrincipalPath = `public/${Date.now()}_${safeFotoPrincipalName}`;

            const { error: fotoPrincipalError } = await supabaseClient.storage
                .from('fotos')
                .upload(fotoPrincipalPath, fotoPrincipalFile);

            if (fotoPrincipalError) throw fotoPrincipalError;

            const { data: fotoPrincipalUrlData } = supabaseClient.storage
                .from('fotos')
                .getPublicUrl(fotoPrincipalPath);

            // Upload do comprovante
            const safeComprovanteName = sanitizeFileName(comprovanteFile.name);
            const comprovantePath = `public/${Date.now()}_${safeComprovanteName}`;

            const { error: comprovanteError } = await supabaseClient.storage
                .from('comprovantes')
                .upload(comprovantePath, comprovanteFile);

            if (comprovanteError) throw comprovanteError;

            const { data: comprovanteUrlData } = supabaseClient.storage
                .from('comprovantes')
                .getPublicUrl(comprovantePath);

            // Upload das fotos adicionais
            let fotosUrls = [];

            for (const file of fotosAdicionaisFiles) {
                const safeFileName = sanitizeFileName(file.name);
                const fotoPath = `public/${Date.now()}_${safeFileName}`;

                const { error: fotoError } = await supabaseClient.storage
                    .from('fotos')
                    .upload(fotoPath, file);

                if (fotoError) throw fotoError;

                const { data: fotoUrlData } = supabaseClient.storage
                    .from('fotos')
                    .getPublicUrl(fotoPath);

                fotosUrls.push(fotoUrlData.publicUrl);
            }

            // Salva no banco
            const { error: dbError } = await supabaseClient
                .from('anuncios')
                .insert({
                    titulo,
                    descricao,
                    localizacao,
                    preco,
                    contacto,
                    pagamento,
                    status: 'pendente',
                    dataCriacao: new Date().toISOString(),
                    comprovante: comprovanteUrlData.publicUrl,
                    fotoPrincipal: fotoPrincipalUrlData.publicUrl,
                    fotos: fotosUrls.length > 0 ? JSON.stringify(fotosUrls) : null,
                });

            if (dbError) throw dbError;

            alert('🎉 Anúncio enviado com sucesso! Seu anúncio será revisado em até 1h.');
            this.reset();
        } catch (error) {
            console.error("Erro ao salvar:", error);
            alert("Erro ao salvar. Tente novamente.");
        } finally {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = 'Enviar Anúncio';
        }
    });

    // Chamadas iniciais
    await carregarCarrosselGrid(); // <<< CHAMADA DO NOVO CARROSSEL
    await carregarImoveisNoMapa();

});
