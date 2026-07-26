/* New square-style watch page */
.unlock-card-v2 {
  width: 100%;
  max-width: 340px;
  margin: 0 auto;
  text-align: center;
  padding: 20px;
}
.wc-thumb-wrap {
  width: 100%;
  aspect-ratio: 1/1;
  border-radius: 18px;
  overflow: hidden;
  background: #1a241d;
  margin-bottom: 16px;
  box-shadow: 0 0 0 2px rgba(53,224,122,0.4);
}
.wc-thumb-wrap img { width: 100%; height: 100%; object-fit: cover; display: block; }
.wc-title {
  font-size: 18px;
  font-weight: 800;
  color: var(--text);
  margin-bottom: 14px;
  line-height: 1.4;
}
.wc-progress-box {
  display: inline-block;
  background: #16201a;
  border: 1px solid rgba(58,160,224,0.4);
  border-radius: 999px;
  padding: 6px 18px;
  font-size: 14px;
  font-weight: 700;
  color: var(--gold);
  margin-bottom: 12px;
}
.wc-hint {
  font-weight: 700;
  font-size: 13.5px;
  color: var(--text);
  margin-bottom: 18px;
}
.watch-loading {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
}
