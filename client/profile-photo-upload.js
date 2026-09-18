(function () {
  const type = document.body.dataset.type?.toLowerCase();
  if (!type || !["student", "employee"].includes(type)) return;

  document.body.insertAdjacentHTML(
    "beforeend",
    `<dialog id="profilePhotoDialog" class="attendance-system-modal">
      <form id="profilePhotoForm">
        <div class="modal-head"><div><span class="section-kicker">PROFILE IMAGE</span><h2 id="profilePhotoTitle">Upload photos</h2></div><button type="button" class="close-button" id="profilePhotoClose" aria-label="Close">×</button></div>
        <div class="form-grid">
          <div class="full record-photo-field">
            <span><strong id="profilePhotoPrompt">Choose image files</strong><small id="profilePhotoHelp">For bulk upload, each filename must be the person's ID number.</small></span>
            <input id="profilePhotoInput" type="file" accept="image/jpeg,image/png,image/webp" required>
          </div>
        </div>
        <p class="form-error" id="profilePhotoError"></p>
        <p id="profilePhotoProgress" role="status" aria-live="polite"></p>
        <div class="modal-actions"><button type="button" class="secondary-button" id="profilePhotoCancel">Cancel</button><button type="submit" class="primary-button" id="profilePhotoSubmit">Upload</button></div>
      </form>
    </dialog>`,
  );

  const dialog = document.querySelector("#profilePhotoDialog");
  const form = document.querySelector("#profilePhotoForm");
  const input = document.querySelector("#profilePhotoInput");
  const error = document.querySelector("#profilePhotoError");
  const progress = document.querySelector("#profilePhotoProgress");
  let selectedPerson = null;

  function openBulk() {
    selectedPerson = null;
    form.reset();
    error.textContent = "";
    progress.textContent = "";
    input.multiple = true;
    document.querySelector("#profilePhotoTitle").textContent =
      `Upload ${type} photos`;
    document.querySelector("#profilePhotoPrompt").textContent =
      "Choose one or more images";
    document.querySelector("#profilePhotoHelp").textContent =
      "Name every image using the ID number. Any number of photos can be selected; they will be queued automatically.";
    dialog.showModal();
  }

  function openSingle(button) {
    selectedPerson = {
      id: button.dataset.personId,
      idNumber: button.dataset.idNumber,
      name: button.dataset.personName,
    };
    form.reset();
    error.textContent = "";
    progress.textContent = "";
    input.multiple = false;
    document.querySelector("#profilePhotoTitle").textContent =
      `Upload photo for ${selectedPerson.name}`;
    document.querySelector("#profilePhotoPrompt").textContent =
      "Choose a profile image";
    document.querySelector("#profilePhotoHelp").textContent =
      `This image will be assigned to ID ${selectedPerson.idNumber}.`;
    dialog.showModal();
  }

  document.querySelector("#bulkPhotoBtn")?.addEventListener("click", openBulk);
  document.addEventListener("click", (event) => {
    const button = event.target.closest(".photo-upload");
    if (button) openSingle(button);
  });
  ["#profilePhotoClose", "#profilePhotoCancel"].forEach((selector) =>
    document
      .querySelector(selector)
      .addEventListener("click", () => dialog.close()),
  );

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!input.files.length) return;
    const submit = document.querySelector("#profilePhotoSubmit");
    submit.disabled = true;
    input.disabled = true;
    document.querySelector("#profilePhotoClose").disabled = true;
    document.querySelector("#profilePhotoCancel").disabled = true;
    error.textContent = "";
    try {
      const files = [...input.files];
      const batches = selectedPerson
        ? [files]
        : Array.from({ length: Math.ceil(files.length / 25) }, (_, index) =>
            files.slice(index * 25, index * 25 + 25),
          );
      const updated = [];
      const unmatched = [];
      let processed = 0;
      for (const batch of batches) {
        const data = new FormData();
        batch.forEach((file) =>
          data.append(selectedPerson ? "photo" : "photos", file),
        );
        const end = processed + batch.length;
        progress.textContent = selectedPerson
          ? "Uploading photoâ€¦"
          : `Uploading queued photos ${processed + 1}â€“${end} of ${files.length}â€¦`;
        submit.textContent = selectedPerson
          ? "Uploadingâ€¦"
          : `Uploading ${end} of ${files.length}`;
        const url = selectedPerson
          ? `/api/${type}/${selectedPerson.id}/photo`
          : `/api/${type}/photos/bulk`;
        const response = await fetch(url, { method: "POST", body: data });
        const result = await response.json().catch(() => ({}));
        if (!response.ok)
          throw new Error(result.message || "Photo upload failed.");
        const completed = selectedPerson ? [result] : result.updated || [];
        updated.push(...completed);
        unmatched.push(...(result.unmatched || []));
        completed.forEach((record) =>
          document.dispatchEvent(
            new CustomEvent("taptrack:photo-updated", { detail: record }),
          ),
        );
        processed = end;
      }
      progress.textContent = `Finished processing ${files.length} photo${files.length === 1 ? "" : "s"}.`;
      TapTrack.toast(
        `${updated.length} photo${updated.length === 1 ? "" : "s"} uploaded.${unmatched.length ? ` ${unmatched.length} filename${unmatched.length === 1 ? " was" : "s were"} not matched.` : ""}`,
        unmatched.length ? "error" : "success",
      );
      dialog.close();
    } catch (uploadError) {
      error.textContent = uploadError.message;
    } finally {
      submit.disabled = false;
      input.disabled = false;
      document.querySelector("#profilePhotoClose").disabled = false;
      document.querySelector("#profilePhotoCancel").disabled = false;
      submit.textContent = "Upload";
    }
  });
})();
