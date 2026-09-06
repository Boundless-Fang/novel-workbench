import collections
import json
import logging
import os
import time
from threading import Lock

import numpy as np
import requests

from core._core_config import (
    DEFAULT_EMBEDDING_MODEL,
    SILICONFLOW_EMBEDDING_URL,
    get_default_embedding_model,
    get_embedding_api_key,
)
from core._core_llm import EMBEDDING_TIMEOUT, create_retry_session
from core._core_utils import safe_faiss_read_index


logging.getLogger("transformers.modeling_utils").setLevel(logging.ERROR)


class RAGCachePool:
    def __init__(self, capacity: int = 1):
        self.cache = collections.OrderedDict()
        self.capacity = capacity
        self.lock = Lock()

    def get(self, key: str):
        with self.lock:
            if key not in self.cache:
                return None
            return self.cache[key]

    def put(self, key: str, value: tuple):
        with self.lock:
            if key in self.cache:
                old_val = self.cache.pop(key)
                del old_val
            self.cache[key] = value
            while len(self.cache) > self.capacity:
                _, popped_val = self.cache.popitem(last=False)
                del popped_val


_global_rag_cache = RAGCachePool(capacity=1)


class DirectSiliconFlowEmbedder:
    def __init__(self):
        self.api_key = get_embedding_api_key()
        self.endpoint = SILICONFLOW_EMBEDDING_URL
        self.model = get_default_embedding_model() or DEFAULT_EMBEDDING_MODEL
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        self.session = create_retry_session()

    def encode(self, texts, batch_size=8, show_progress_bar=False):
        if isinstance(texts, str):
            texts = [texts]

        all_embeddings = []
        total_chunks = len(texts)

        for i in range(0, total_chunks, batch_size):
            batch_texts = texts[i:i + batch_size]
            safe_texts = [t if t.strip() else " " for t in batch_texts]

            payload = {
                "model": self.model,
                "input": safe_texts,
            }

            try:
                response = self.session.post(
                    self.endpoint,
                    headers=self.headers,
                    json=payload,
                    timeout=EMBEDDING_TIMEOUT,
                )
                response.raise_for_status()

                data = response.json()
                embeddings = [item["embedding"] for item in data["data"]]
                all_embeddings.extend(embeddings)

                if show_progress_bar:
                    current = min(i + batch_size, total_chunks)
                    print(f"[INFO] Embedding progress: {current} / {total_chunks} chunks", flush=True)

                time.sleep(0.2)
            except requests.exceptions.RequestException as exc:
                status_code = getattr(exc.response, "status_code", None)
                error_detail = ""
                if exc.response is not None:
                    try:
                        error_detail = exc.response.text
                    except Exception:
                        error_detail = ""
                print(
                    f"[ERROR] Embedding request failed (status: {status_code}): {exc}\n"
                    f"Details: {error_detail}"
                )
                raise RuntimeError(
                    "Embedding request failed. Check API availability, request size, and quota."
                ) from exc
            except KeyError as exc:
                print(f"[ERROR] Embedding response schema changed: missing key {exc}")
                raise RuntimeError("Embedding response schema is invalid.") from exc

        return np.array(all_embeddings, dtype="float32")


class RAGRetriever:
    def __init__(self):
        self.embedder = None

    def get_embedder(self):
        if self.embedder is None:
            self.embedder = DirectSiliconFlowEmbedder()
        return self.embedder

    def load_index(self, index_path, chunks_path):
        if not os.path.exists(index_path) or not os.path.exists(chunks_path):
            raise FileNotFoundError("RAG index or chunks metadata file is missing.")

        safe_index_path = os.path.normcase(os.path.realpath(os.path.abspath(index_path)))
        safe_chunks_path = os.path.normcase(os.path.realpath(os.path.abspath(chunks_path)))

        try:
            index_mtime = os.path.getmtime(safe_index_path)
            cache_key = f"{safe_index_path}_{index_mtime}"
        except OSError as exc:
            raise RuntimeError("Cannot read target index file metadata.") from exc

        cached_data = _global_rag_cache.get(cache_key)
        if cached_data is not None:
            return cached_data[0], cached_data[1]

        try:
            index = safe_faiss_read_index(safe_index_path)

            with open(safe_chunks_path, "r", encoding="utf-8") as file:
                chunks = json.load(file)

            _global_rag_cache.put(cache_key, (index, chunks))
            return index, chunks
        except OSError as exc:
            raise RuntimeError("Failed to read index or chunk metadata from disk.") from exc
        except json.JSONDecodeError as exc:
            raise RuntimeError("Chunks metadata JSON is corrupted.") from exc

    def search(self, index, chunks, queries, k=6, batch_size=5):
        embedder = self.get_embedder()
        retrieved_chunks = set()

        for i in range(0, len(queries), batch_size):
            batch_queries = [" ".join(queries[i:i + batch_size])]
            query_vec = embedder.encode(batch_queries)
            _, indices = index.search(np.array(query_vec).astype("float32"), k)

            for idx in indices[0]:
                if idx != -1 and idx < len(chunks):
                    chunk_data = chunks[idx]
                    if isinstance(chunk_data, dict):
                        retrieved_chunks.add(chunk_data.get("raw_chunk", chunk_data.get("text", "")))
                    else:
                        retrieved_chunks.add(chunk_data)

        return list(retrieved_chunks)
