export async function loadPublishedSections() {
  const response = await fetch("/api/sections");
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Avsnitten kunde inte hämtas.");
  if (!Array.isArray(result.sections)) throw new Error("Svaret från servern hade ett oväntat format.");
  return result.sections;
}

export function renderSectionContent(section, container) {
  const blocks = section.content.map(item => {
    const article = document.createElement("article");
    article.className = "content-block";
    if (item.title) {
      const heading = document.createElement("h2");
      heading.textContent = item.title;
      article.append(heading);
    }
    if (item.body) {
      const paragraph = document.createElement("p");
      paragraph.textContent = item.body;
      paragraph.style.whiteSpace = "pre-wrap";
      article.append(paragraph);
    }
    return article;
  });
  container.replaceChildren(...blocks);
}
