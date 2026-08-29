(function () {
  const type = document.body.dataset.type?.toLowerCase();
  if (!type || !["student", "employee"].includes(type)) return;

  document.body.insertAdjacentHTML(
    "beforeend",
    `<dialog id="profilePhotoDialog" class="satp-modal">
      <form id="profilePhotoForm">
        <div class="modal-head"><div><span class="section-kicker">PROFILE IMAGE</span><h2 id="profilePhotoTitle">Upload photos</h2></div><button type="button" class="close-button" id="profilePhotoClose" aria-label="Close"></button></div>
        <div class="profile-photo-picker">
          <strong id="profilePhotoPrompt">Choose image files</strong>
          <p id="profilePhotoHelp">For bulk upload, each filename must be the person's ID number.</p>
          <input id="profilePhotoInput" type="file" accept="image/jpeg,image/png,image/webp" required>
        </div>
        <p class="form-error" id="profilePhotoError"></p>
        <div class="modal-actions"><button type="button" class="secondary-button" id="profilePhotoCancel">Cancel</button><button type="submit" class="primary-button" id="profilePhotoSubmit">Upload</button></div>
      </form>
    </dialog>`,
  );

  const dialog = document.querySelector("#profilePhotoDialog");
  const form = document.querySelector("#profilePhotoForm");
  const input = document.querySelector("#profilePhotoInput");
  const error = document.querySelector("#profilePhotoError");
  let selectedPerson = null;

  function openBulk() {
    selectedPerson = null;
    form.reset();
    error.textContent = "";
    input.multiple = true;
    document.querySelector("#profilePhotoTitle").textContent =
      `Upload ${type} photos`;
    document.querySelector("#profilePhotoPrompt").textContent =
      "Choose one or more images";
    document.querySelector("#profilePhotoHelp").textContent =
      "Name every image using the ID number, for example 2023620.jpg.";
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
    error.textContent = "";
    try {
      const data = new FormData();
      [...input.files].forEach((file) =>
        data.append(selectedPerson ? "photo" : "photos", file),
      );
      const token = localStorage.getItem("taptrack_token");
      const url = selectedPerson
        ? `/api/${type}/${selectedPerson.id}/photo`
        : `/api/${type}/photos/bulk`;
      const response = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token || ""}` },
        body: data,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(result.message || "Photo upload failed.");
      const updated = selectedPerson ? [result] : result.updated || [];
      updated.forEach((record) =>
        document.dispatchEvent(
          new CustomEvent("taptrack:photo-updated", { detail: record }),
        ),
      );
      const unmatched = result.unmatched || [];
      TapTrack.toast(
        `${updated.length} photo${updated.length === 1 ? "" : "s"} uploaded.${unmatched.length ? ` ${unmatched.length} filename${unmatched.length === 1 ? " was" : "s were"} not matched.` : ""}`,
        unmatched.length ? "error" : "success",
      );
      dialog.close();
    } catch (uploadError) {
      error.textContent = uploadError.message;
    } finally {
      submit.disabled = false;
    }
  });
})();
